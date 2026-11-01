import { useState } from 'react';
import { Icon } from '../ui/icons';
import { AssetLibrary } from './AssetLibrary';
import { LayersPanel } from './LayersPanel';
import { PropertiesPanel } from './PropertiesPanel';
import { useEditor } from './store';

export function Sidebar() {
  const [tab, setTab] = useState<'add' | 'layers'>('add');
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 700px)').matches);
  const tool = useEditor((s) => s.tool);
  const st = useEditor.getState;

  if (collapsed)
    return (
      <aside className="sidebar collapsed">
        <button className="icon-btn" title="Show sidebar" aria-label="Show sidebar" onClick={() => setCollapsed(false)}>
          <Icon name="chevronRight" />
        </button>
      </aside>
    );

  const addRowAtCenter = () => {
    const s = st();
    const v = s.viewport;
    s.openRowDialog({ x: (s.viewSize.width / 2 - v.x) / v.scale - 200, y: (s.viewSize.height / 2 - v.y) / v.scale, rotation: 0 });
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'add'} className={tab === 'add' ? 'active' : ''} onClick={() => setTab('add')}>
          <Icon name="shapes" size={16} /> Add
        </button>
        <button role="tab" aria-selected={tab === 'layers'} className={tab === 'layers' ? 'active' : ''} onClick={() => setTab('layers')} data-testid="tab-layers">
          <Icon name="layers" size={16} /> Layers
        </button>
        <button className="icon-btn collapse" title="Hide sidebar" aria-label="Hide sidebar" onClick={() => setCollapsed(true)}>
          <Icon name="chevronLeft" />
        </button>
      </div>
      <div className="sidebar-body">
        {tab === 'add' ? (
          <>
            <section className="spaces-tools">
              <h4>Parking spaces</h4>
              <button
                className={`btn block primary-soft${tool.type === 'row' ? ' on' : ''}`}
                onClick={() => st().setTool(tool.type === 'row' ? { type: 'select' } : { type: 'row' })}
                data-testid="tool-row"
              >
                <Icon name="rows" size={16} /> Draw a row of spaces
              </button>
              {tool.type === 'row' && <p className="hint">Drag across the map where the row goes, or click once to place it.</p>}
              <button className="btn block" onClick={addRowAtCenter} data-testid="add-row">
                <Icon name="plus" size={16} /> Add row by number
              </button>
            </section>
            <AssetLibrary />
          </>
        ) : (
          <LayersPanel />
        )}
      </div>
      <PropertiesPanel />
    </aside>
  );
}
