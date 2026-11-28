/** Semantic controls rendered by GPUI. No HTML, CSS or browser is evaluated. */
type ShinawasePageNode = {
  kind: 'column' | 'row' | 'columns' | 'section' | 'heading' | 'text' | 'button'
    | 'field' | 'switch' | 'badge' | 'code' | 'markdown' | 'card'
    | 'mast' | 'kicker' | 'title' | 'setting' | 'image';
  text?: string;
  children?: ShinawasePageNode[];
  action?: string;
  submit?: string;
  id?: string;
  value?: string;
  multiline?: boolean;
  secret?: boolean;
  change?: boolean;
  selected?: boolean;
  disabled?: boolean;
  tone?: 'muted' | 'error' | 'success' | 'primary';
  description?: string;
  /** Bounded package image; network fetching happens in the Loader, never during render. */
  image?: { format: 'png' | 'jpeg' | 'webp' | 'svg'; bytes: number[] };
};
