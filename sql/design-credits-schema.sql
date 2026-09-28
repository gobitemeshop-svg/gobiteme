-- Gobiteme design-credit system.
-- Model: user pays £1 per bundle for AI design generation; the FULL cumulative amount they've
-- ever paid in bundles that hasn't yet been applied to an order sits as running credit, shown as
-- a straight deduction line at checkout ("Design credit: -£3.00" if they bought 3 bundles and
-- haven't checked out yet). This protects against someone generating unlimited designs without
-- ever ordering (they've genuinely paid £1 per bundle either way), while giving full credit back
-- the moment they do convert to a real order — never partial/prorated by how many designs they
-- actually used within a bundle.

create table if not exists design_credit_bundles (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  amount_gbp numeric(10,2) not null default 1.00,
  -- PRICING RULE (direct instruction 2026-09-28): price per design = real measured generation
  -- cost (the Midjourney-wrapper's actual per-image £ cost) + a flat 2p markup. designs_included
  -- = floor(100p / price_per_design_pence). This CANNOT be hardcoded yet — the wrapper integration
  -- isn't built/measured yet, so there is no real cost number to compute from. Same discipline as
  -- Oracle's own pricing: measure the real cost first (mmCostOf()-style), set the number from that
  -- measurement, never guess. Whatever the number turns out to be gets written here per bundle at
  -- purchase time (not a fixed site-wide constant), so a later drop in generation cost can offer
  -- more designs per £1 on new bundles without needing a schema change.
  designs_included integer not null,
  designs_used integer not null default 0,    -- incremented each time this bundle's allowance is drawn from (oldest bundle first)
  square_payment_id text,                     -- Square's own payment/order id for this £1 charge, for reconciliation
  -- No FK to an orders table yet — that table doesn't exist in this new project until the
  -- checkout system itself is built. Tighten this to `references orders(id)` once it does.
  applied_to_order_id uuid,                   -- set once this bundle's remaining credit has been consumed by a checkout; null while still outstanding
  created_at timestamptz not null default now()
);

create index if not exists idx_design_credit_bundles_user on design_credit_bundles(user_email);
create index if not exists idx_design_credit_bundles_unapplied on design_credit_bundles(user_email) where applied_to_order_id is null;

-- Running, unapplied credit balance for a user — the exact amount to show as a deduction line at
-- checkout. Sums every bundle this user has paid for that hasn't yet been consumed by an order.
create or replace function gb_credit_balance(p_user_email text)
returns numeric
language sql
stable
as $$
  select coalesce(sum(amount_gbp), 0)
  from design_credit_bundles
  where user_email = p_user_email
    and applied_to_order_id is null;
$$;

-- Design-generation allowance still remaining across every unapplied bundle (oldest-first spend),
-- used to gate "you're out of design credits, buy another £1 bundle" in the design engine UI.
create or replace function gb_designs_remaining(p_user_email text)
returns integer
language sql
stable
as $$
  select coalesce(sum(designs_included - designs_used), 0)
  from design_credit_bundles
  where user_email = p_user_email
    and applied_to_order_id is null;
$$;

-- Atomically consumes one design generation from the user's oldest unapplied bundle with
-- allowance left. Returns true if a generation was actually available and consumed, false if the
-- user is genuinely out of credit (the design engine must refuse to fire the AI generation call
-- in that case, not fire it and hope to bill later — never let a generation happen for free).
create or replace function gb_consume_design(p_user_email text)
returns boolean
language plpgsql
as $$
declare
  v_bundle_id uuid;
begin
  select id into v_bundle_id
  from design_credit_bundles
  where user_email = p_user_email
    and applied_to_order_id is null
    and designs_used < designs_included
  order by created_at asc
  limit 1
  for update skip locked;

  if v_bundle_id is null then
    return false;
  end if;

  update design_credit_bundles
  set designs_used = designs_used + 1
  where id = v_bundle_id;

  return true;
end;
$$;

-- Applies the user's full outstanding credit to a real order at checkout, marking every unapplied
-- bundle as consumed by that order (so it can never be double-spent on a later checkout), and
-- returns the total £ amount that should be deducted from the order total.
create or replace function gb_apply_credit_to_order(p_user_email text, p_order_id uuid)
returns numeric
language plpgsql
as $$
declare
  v_total numeric;
begin
  select coalesce(sum(amount_gbp), 0) into v_total
  from design_credit_bundles
  where user_email = p_user_email
    and applied_to_order_id is null;

  update design_credit_bundles
  set applied_to_order_id = p_order_id
  where user_email = p_user_email
    and applied_to_order_id is null;

  return v_total;
end;
$$;
