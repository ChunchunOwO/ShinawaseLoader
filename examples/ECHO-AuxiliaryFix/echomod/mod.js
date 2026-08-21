const external = echoExternalMod;
const app = () => external.echo?.app || window.echo?.app;
const desktopLyrics = () => external.echo?.desktopLyrics || window.echo?.desktopLyrics;
const pet = () => external.echo?.pet || window.echo?.pet;

const sanitize = async () => {
  const api = app();
  if (!api?.getSettings || !api?.setSettings) return;
  const settings = await api.getSettings();
  const patch = {};
  if (settings.desktopLyricsEnabled && !desktopLyrics()) patch.desktopLyricsEnabled = false;
  if (settings.petEnabled && !pet()) patch.petEnabled = false;
  if (Object.keys(patch).length) await api.setSettings(patch);
};

const guardShow = (api, name, settingKey) => {
  if (!api?.show || api.__shinawaseGuarded) return;
  const original = api.show.bind(api);
  api.show = async (...args) => {
    try {
      return await original(...args);
    } catch (error) {
      try { await app()?.setSettings?.({ [settingKey]: false }); } catch {}
      throw error;
    }
  };
  api.__shinawaseGuarded = true;
};

const hideBrokenControls = () => {
  if (pet()) return;
  document.querySelectorAll('[data-action="togglePet"], [aria-label*="Pet"], [title*="Pet"]').forEach((node) => {
    node.style.display = 'none';
  });
};

void sanitize();
guardShow(desktopLyrics(), 'desktopLyrics', 'desktopLyricsEnabled');
guardShow(pet(), 'pet', 'petEnabled');
hideBrokenControls();
const observer = new MutationObserver(hideBrokenControls);
observer.observe(document.body, { childList: true, subtree: true });
return () => observer.disconnect();
