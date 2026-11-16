// University styles: symbols drawn as one university's lecture slides draw them. A style is one record here; a part
// joins it by naming its id (the circuit catalogue's `style`), and shows under a group named after the style. Each
// style has a switch in Settings › Diagram composer, on unless the user turns it off (composerStylesOff).

export interface UniversityStyle {
  id: string;
  name: string;
  university: string;
}

/** Sorted by name, as Settings lists them. */
export const UNIVERSITY_STYLES: UniversityStyle[] = [{ id: 'mu', name: 'MU Style', university: 'Hong Kong Metropolitan University' }].sort((a, b) =>
  a.name.localeCompare(b.name)
);

export const styleFor = (id: string) => UNIVERSITY_STYLES.find((style) => style.id === id);

/** A part of a style switched off: it leaves the parts list and the searches, though drawings that use it still draw it. */
export const styleHidden = (style: string | undefined, off: string[]) => !!style && off.includes(style);
