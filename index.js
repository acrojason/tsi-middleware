// ESM export: ST dynamically imports this and calls init()
export async function init(api) {
  console.log('[TS-MW] init called');

  // Prove the hook triggers when you send a message
  api.registerHook('message:send', async (payload, next) => {
    console.log('[TS-MW] message:send type=%s text=%s',
      payload?.type, (payload?.text || '').slice(0, 120));
    return next(payload);
  });

  return { success: true, message: 'TS MW loaded' };
}

