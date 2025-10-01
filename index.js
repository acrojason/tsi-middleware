let ST;
async function init(api) {
  ST = api;
  console.log('[TS-MW] init called');

  ST.registerHook('message:send', async (payload, next) => {
    console.log('[TS-MW] message:send type=%s text=%s',
      payload?.type, (payload?.text||'').slice(0, 120));
    return next(payload);
  });

  return { success: true, message: 'TS MW loaded' };
}
module.exports = { init };
