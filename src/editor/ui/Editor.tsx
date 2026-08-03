import { useMemo } from 'react';
import { Editor as ByteMDEditor } from '@bytemd/react';
import { buildPlugins } from './bytemd-plugins.tsx';

/**
 * ByteMD editor wrapper: toolbar + live split preview, themed via editor.css to the
 * site tokens. Image insertion goes through the single custom "Insert image" dialog
 * button (upload / pick / URL + alt / size / caption) — see bytemd-plugins + EditorApp.
 */
export default function Editor({
  value,
  onChange,
  onImage,
}: {
  value: string;
  onChange: (v: string) => void;
  onImage: () => void;
}) {
  // Rebuild the plugin pipeline only when onImage changes — a fresh array every render
  // makes @bytemd/react re-run its Svelte plugin setup (and viewerEffect) on each keystroke.
  const plugins = useMemo(() => buildPlugins({ onImage }), [onImage]);
  return (
    <div data-testid="bytemd-editor" className="bmd-wrap">
      <ByteMDEditor value={value} mode="split" plugins={plugins} onChange={onChange} />
    </div>
  );
}
