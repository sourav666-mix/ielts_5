/* ============================================================
   ATLAS IELTS Academy — Task 1 card (prompt + visual)

   React.memo'd so the heavy chart never re-renders while the
   student types (the day store clones the writing task objects
   on every keystroke, but `content.task1` keeps a stable
   reference — memo catches it, exactly as designed in Batch 5's
   performance notes).

   §14.4 images: fetched only for process/map, memoised in
   writingFlow by visual identity; results-view remounts hit the
   cache instantly. `task1.image` (if the server attached one)
   is used directly, no fetch.
   ============================================================ */

import React, { useEffect, useState } from 'react';
import { LineGraphVisual, MixedChartVisual, PieChartVisual, TableVisual } from './ChartVisuals.jsx';
import { ProcessDiagramVisual, MapDiagramVisual } from './DiagramVisuals.jsx';
import { fetchTaskImage } from '../../lib/writingFlow.js';
import '../../styles/writing.css';

const IMAGE_TYPES = new Set(['process_diagram', 'map']);

/** Task 2 (and any plain) prompt — shared by session & results. */
export function TaskPrompt({ children }) {
  return <p className="task-prompt">{children}</p>;
}

const Task1Visual = React.memo(function Task1Visual({ task1 }) {
  const [image, setImage] = useState(task1?.image || '');
  const [imageLoading, setImageLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (task1?.image) {
      setImage(task1.image);
      setImageLoading(false);
      return undefined;
    }
    if (!IMAGE_TYPES.has(task1?.visualType)) {
      setImage('');
      setImageLoading(false);
      return undefined;
    }
    setImageLoading(true);
    fetchTaskImage(task1).then((url) => {
      if (cancelled) return;
      setImage(url);
      setImageLoading(false);
    });
    return () => { cancelled = true; };
  }, [task1]);

  if (!task1) return null;
  const cd = task1.chartData;

  return (
    <article className="stack-t" aria-label="Task 1">
      <TaskPrompt>{task1.prompt}</TaskPrompt>
      <div className="chart-frame">
        {cd?.title && <p className="chart-title">{cd.title}</p>}
        {task1.visualType === 'line_graph' && <LineGraphVisual chartData={cd} />}
        {task1.visualType === 'mixed' && <MixedChartVisual chartData={cd} />}
        {task1.visualType === 'pie_chart' && <PieChartVisual chartData={cd} />}
        {task1.visualType === 'table' && <TableVisual chartData={cd} />}
        {task1.visualType === 'process_diagram' && (
          <ProcessDiagramVisual chartData={cd} image={image} imageLoading={imageLoading} />
        )}
        {task1.visualType === 'map' && <MapDiagramVisual chartData={cd} image={image} />}
      </div>
    </article>
  );
});

export default Task1Visual;