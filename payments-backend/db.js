// Supabase-backed data access for server-authoritative rows. Pass a service-role
// client to makeDb(). All methods are async.
export function makeDb(client) {
  return {
    async getCustomer(userId) {
      const { data, error } = await client.from('stripe_customers')
        .select('customer_id').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return data?.customer_id ?? null;
    },
    async setCustomer(userId, customerId) {
      const { error } = await client.from('stripe_customers')
        .upsert({ user_id: userId, customer_id: customerId, updated_at: new Date().toISOString() },
                { onConflict: 'user_id' });
      if (error) throw error;
    },
    async getDefaultPM(userId) {
      const { data, error } = await client.from('stripe_customers')
        .select('default_pm').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return data?.default_pm ?? null;
    },
    async setDefaultPMByUser(userId, pm) {
      const { error } = await client.from('stripe_customers')
        .upsert({ user_id: userId, default_pm: pm, updated_at: new Date().toISOString() },
                { onConflict: 'user_id' });
      if (error) throw error;
    },
    async setDefaultPMByCustomer(customerId, pm) {
      const { error } = await client.from('stripe_customers')
        .update({ default_pm: pm, updated_at: new Date().toISOString() })
        .eq('customer_id', customerId);
      if (error) throw error;
    },
    async getStake(userId, habitId) {
      const { data, error } = await client.from('stakes')
        .select('amount_cents').eq('user_id', userId).eq('habit_id', habitId).maybeSingle();
      if (error) throw error;
      return data?.amount_cents ?? null;
    },
    async setStake(userId, habitId, amountCents) {
      const { error } = await client.from('stakes')
        .upsert({ user_id: userId, habit_id: habitId, amount_cents: amountCents,
                  updated_at: new Date().toISOString() }, { onConflict: 'user_id,habit_id' });
      if (error) throw error;
    },
  };
}
