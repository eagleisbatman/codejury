export async function renderTui(): Promise<void> {
  const { render } = await import('ink');
  const { default: App } = await import('@codejury/tui');
  const { createElement } = await import('react');
  render(createElement(App));
}
