/* ============================================================
   ATLAS IELTS Academy — process & map visuals (§6.2, §14)

   §14.4 flow, in order: the CSS schematic renders IMMEDIATELY
   (steps / before-after panes from the stored chartData — the
   task is always usable), then the AI illustration arrives and
   swaps in. Image failure is cached as no-image; the schematic
   is the steady state, never a spinner wall.
   ============================================================ */

import React from 'react';
import '../../styles/writing.css';

/* ── Process diagram ───────────────────────────────────────── */

export function ProcessDiagramVisual({ chartData, image, imageLoading }) {
  if (!chartData) return null;

  if (image) {
    const alt = `Illustrated process diagram: ${chartData.steps.map((s) => s.label).join(' → ')}`;
    return <img className="ai-diagram" src={image} alt={alt} />;
  }

  return (
    <div>
      <div className="flow-steps">
        {chartData.steps.map((s, i) => (
          <React.Fragment key={i}>
            {i > 0 && <div className="flow-arrow" aria-hidden="true">↓</div>}
            <div className="flow-step">
              <div className="flow-step-label">{s.label}</div>
              {s.description && <div className="flow-step-desc">{s.description}</div>}
            </div>
          </React.Fragment>
        ))}
      </div>
      {imageLoading && (
        <p className="img-note" role="status">
          <span className="spinner" aria-hidden="true" />
          Sketching your diagram… {/* §15.4's exact loading copy */}
        </p>
      )}
    </div>
  );
}

/* ── Map: before / after panes ─────────────────────────────── */

export function MapDiagramVisual({ chartData, image }) {
  if (!chartData) return null;

  if (image) {
    const alt = `Illustrated map comparing ${chartData.before.caption || 'the original layout'} and ${chartData.after.caption || 'the revised layout'}`;
    return <img className="ai-diagram" src={image} alt={alt} />;
  }

  return (
    <div className="map-grid">
      {[
        { key: 'before', pane: chartData.before },
        { key: 'after', pane: chartData.after },
      ].map(({ key, pane }) => (
        <div key={key} className="stack-t">
          <div
            className="map-pane"
            role="img"
            aria-label={`${key === 'before' ? 'Original' : 'Revised'} plan: ${pane.features.map((f) => f.label).join(', ')}`}
          >
            {pane.features.map((f, i) => (
              <span
                key={i}
                className="map-pin"
                style={{ left: `${f.x}%`, top: `${f.y}%` }}
              >
                {f.label}
              </span>
            ))}
          </div>
          {pane.caption && <p className="map-caption">{pane.caption}</p>}
        </div>
      ))}
    </div>
  );
}