(() => {
  try {
    const search = String(location.search || '');
    if (!/[?&](desktopLyrics|pet|miniPlayer)=1/i.test(search)) return;
    const root = document.documentElement;
    const hide = () => {
      root.dataset.echoStartup = 'disabled';
      document.querySelectorAll('.echo-startup-shell').forEach((node) => node.remove());
    };
    hide();
    const observer = new MutationObserver(hide);
    observer.observe(root, { childList: true, subtree: true });
    const stop = () => observer.disconnect();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        hide();
        setTimeout(stop, 1500);
      }, { once: true });
    } else {
      setTimeout(stop, 1500);
    }
  } catch (_) {}
})();
