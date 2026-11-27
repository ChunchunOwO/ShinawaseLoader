/// <reference path="../zankyo-external-mod.d.ts" />
const { ui, core } = echoExternalMod.zankyo;
const target = (await ui.views()).find((view) => view.endsWith('::player_view::Player'))
  || 'echo_gpui::player_view::Player';
await ui.patch(target, {
  type: 'row', fill: true, padding: 16, gap: 12, height: 72,
  background: 0x2b5142, color: 0xffffff,
  children: [
    { type: 'text', text: 'Shinawase · 原生视图实时修改成功', size: 16 },
    { type: 'button', text: '播放 / 暂停', onClick: 'toggle', padding: 8 },
  ],
});
const removePage = ui.page('controls', {
  label: 'Zankyo live view',
  body: {
    kind: 'section',
    children: [
      { kind: 'heading', text: 'Zankyo live view' },
      { kind: 'text', text: 'This native page belongs to the enabled Mod and retires with it.' },
      { kind: 'button', text: 'Play / pause', action: 'toggle', tone: 'primary' },
    ],
  },
});
const stopActions = ui.onAction(async (action) => {
  if (action === 'toggle') await echoExternalMod.zankyo.core('playback.control', { action: 'toggle' });
});
// Audio integration stays in the Mod; the host only dispatches generic commands.
let devices = [];
let graph = '';
let result = '';
const audioPage = async () => {
  devices = await core('audio.output.listDevices');
  const output = await core('audio.output.getStatus');
  ui.page('audio', {
    label: 'Audio tools',
    body: { kind: 'column', children: [
      { kind: 'heading', text: 'Audio tools' },
      { kind: 'text', text: 'Output, analysis and DSP use the same playback session as ECHO.' },
      { kind: 'code', text: JSON.stringify(output, null, 2) },
      { kind: 'button', text: 'Refresh', action: 'audio-refresh' },
      { kind: 'button', text: 'System default output', action: 'audio-default' },
      ...devices.slice(0, 64).map((device, index) => ({
        kind: 'button', text: device.name, action: 'audio-device/' + index,
      })),
      { kind: 'button', text: 'Read audio analysis', action: 'audio-analysis' },
      { kind: 'button', text: 'Read DSP graph', action: 'audio-dsp-read' },
      { kind: 'field', id: 'dspGraph', text: 'DSP graph JSON', value: graph, multiline: true },
      { kind: 'button', text: 'Apply DSP graph', action: 'audio-dsp-apply' },
      { kind: 'code', text: result },
    ] },
  });
};
const stopAudio = ui.onAction(async (action, fields) => {
  if (!action.startsWith('audio-')) return;
  try {
    if (action === 'audio-default') await core('audio.output.setOutput', { target: { kind: 'systemDefault' } });
    else if (action.startsWith('audio-device/')) {
      const device = devices[Number(action.slice(13))];
      if (!device) throw new Error('Refresh the device list');
      await core('audio.output.setOutput', { target: { kind: 'device', id: device.id } });
    } else if (action === 'audio-analysis') result = JSON.stringify(await core('audio.getAnalysis'), null, 2);
    else if (action === 'audio-dsp-read') graph = JSON.stringify(await core('audio.dsp.getGraph'), null, 2);
    else if (action === 'audio-dsp-apply') {
      graph = fields.dspGraph;
      result = JSON.stringify(await core('audio.dsp.applyGraph', JSON.parse(graph)), null, 2);
    }
    await audioPage();
  } catch (error) { echoExternalMod.toast(error.message); }
});
await audioPage();
return () => { stopActions(); stopAudio(); removePage(); };
