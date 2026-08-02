import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView } from '@codemirror/view';

export default function MarkdownEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div data-testid="cm-editor" style={{ height: '100%', overflow: 'auto' }}>
      <CodeMirror
        value={value}
        onChange={onChange}
        theme="dark"
        extensions={[markdown(), EditorView.lineWrapping]}
        basicSetup={{ lineNumbers: true, foldGutter: false }}
        height="100%"
        style={{ fontSize: 14 }}
      />
    </div>
  );
}
