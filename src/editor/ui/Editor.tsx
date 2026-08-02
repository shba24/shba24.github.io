import { Editor as ByteMDEditor } from '@bytemd/react';
import { buildPlugins } from './bytemd-plugins.tsx';
import { uploadImage } from './api.ts';

/**
 * ByteMD editor wrapper. Toolbar + live split preview, themed via editor.css to the
 * site tokens. Paste/drag image upload is wired through the file API (needs a slug).
 */
export default function Editor({
  value,
  onChange,
  onImage,
  slug,
}: {
  value: string;
  onChange: (v: string) => void;
  onImage: () => void;
  slug: string | null;
}) {
  return (
    <div data-testid="bytemd-editor" className="bmd-wrap">
      <ByteMDEditor
        value={value}
        mode="split"
        plugins={buildPlugins({ onImage })}
        onChange={onChange}
        uploadImages={async (files: File[]) => {
          if (!slug) return [];
          const out: { url: string; title?: string }[] = [];
          for (const f of files) {
            try {
              out.push({ url: await uploadImage(slug, f), title: 'medium' });
            } catch {
              /* skip failed upload */
            }
          }
          return out;
        }}
      />
    </div>
  );
}
