// scripts/extensions/third-party/tsi-middleware/index.js
(() => {
  const MODULE = 'tsi-middleware';

  // Helper to safely get ST context once ready
  function onAppReady(run) {
    const st = window.SillyTavern;
    if (!st || !st.getContext) {
      console.warn('[TSI-MW] SillyTavern not present yet, retrying…');
      setTimeout(() => onAppReady(run), 200);
      return;
    }
    const { eventSource, event_types } = st.getContext();
    // If APP_READY listeners are added after the app is ready, ST will auto-fire the event
    eventSource.on(event_types.APP_READY, () => run(st.getContext()));
  }

  function boot(ctx) {
    console.log('[TSI-MW] APP_READY → booting with context:', ctx);

    // --- Visible proof the extension is alive (UI pill) ---
    const pill = document.createElement('div');
    pill.textContent = 'TSI-MW active';
    Object.assign(pill.style, {
      position: 'fixed', right: '12px', bottom: '12px',
      padding: '6px 10px', borderRadius: '10px',
      background: 'var(--SmartThemeAccent)', color: 'var(--SmartThemeBodyColor)',
      zIndex: 9999, fontSize: '12px', boxShadow: '0 2px 8px rgba(0,0,0,.25)',
    });
    document.body.appendChild(pill);
    console.log('[TSI-MW] UI pill mounted');

    // --- Minimal /check command (client-side) ---
    // Listen for user messages and intercept "/check"
    const { eventSource, event_types } = ctx;
    eventSource.on(event_types.MESSAGE_SENT, async (payload) => {
      try {
        const text = (payload?.message ?? payload?.mes ?? '').trim();
        if (!/^\/check\b/i.test(text)) return;

        console.log('[TSI-MW] /check received');
        // Give the user immediate feedback without touching the backend:
        // show a toast if available, otherwise just a console log
        (ctx.addToast || console.log)('TSI-MW: ✅ alive and listening');

        // Optionally, append a bot message to chat quietly:
        if (ctx.pushToChat) {
          ctx.pushToChat({
            is_user: false,
            name: 'TSI-MW',
            mes: '✅ TSI-MW: alive and listening',
            extra: { module: MODULE },
          });
        }
        // Prevent further handling if you want to swallow the slash command
        // return true; // (only if you want to stop other handlers)
      } catch (e) {
        console.error('[TSI-MW] /check handler error:', e);
      }
    });

    console.log('[TSI-MW] Handlers installed');
  }

  console.log('[TSI-MW] index.js loaded; waiting for APP_READY…');
  onAppReady(boot);
})();
