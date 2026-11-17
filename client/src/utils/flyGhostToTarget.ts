import {
  ACTION_MOVE_FLIGHT_ARC_PEAK_OFFSET,
  ACTION_MOVE_GHOST_END_OPACITY,
  ACTION_MOVE_GHOST_TEST_ID,
  ActionMoveFlightStyle,
} from 'constants/actionMove';

interface FlightPoint {
  x: number;
  y: number;
}

function centreOf(rect: DOMRect): FlightPoint {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function createGhost(source: DOMRect, label: string, className: string): HTMLDivElement {
  const ghost = document.createElement('div');
  ghost.className = className;
  ghost.textContent = label;
  ghost.setAttribute('aria-hidden', 'true');
  ghost.dataset.testid = ACTION_MOVE_GHOST_TEST_ID;
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${source.left}px`,
    top: `${source.top}px`,
    width: `${source.width}px`,
    height: `${source.height}px`,
    pointerEvents: 'none',
  });
  return ghost;
}

function buildFlightKeyframes(source: DOMRect, target: DOMRect, style: ActionMoveFlightStyle): Keyframe[] {
  const from = centreOf(source);
  const to = centreOf(target);
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const peakX = deltaX * ACTION_MOVE_FLIGHT_ARC_PEAK_OFFSET;
  const peakY = Math.min(0, deltaY) * ACTION_MOVE_FLIGHT_ARC_PEAK_OFFSET - style.arcHeightPx;
  const peakScale = (1 + style.endScale) / 2;
  return [
    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    {
      transform: `translate(${peakX}px, ${peakY}px) scale(${peakScale})`,
      opacity: 1,
      offset: ACTION_MOVE_FLIGHT_ARC_PEAK_OFFSET,
    },
    { transform: `translate(${deltaX}px, ${deltaY}px) scale(${style.endScale})`, opacity: ACTION_MOVE_GHOST_END_OPACITY },
  ];
}

/**
 * Flies a copy of an element from `source` to `target` along an arc, then removes it.
 * Resolves when the copy has landed so the caller can react on the destination.
 * Browsers without the Web Animations API skip the flight and resolve at once.
 */
export function flyGhostToTarget(
  source: DOMRect,
  target: DOMRect,
  label: string,
  style: ActionMoveFlightStyle
): Promise<void> {
  const ghost = createGhost(source, label, style.ghostClassName);
  if (typeof ghost.animate !== 'function') {
    return Promise.resolve();
  }
  document.body.appendChild(ghost);
  const animation = ghost.animate(buildFlightKeyframes(source, target, style), {
    duration: style.durationMs,
    easing: 'cubic-bezier(0.5, 0, 0.3, 1)',
    fill: 'forwards',
  });
  return animation.finished
    .catch(() => undefined)
    .then(() => {
      ghost.remove();
    });
}
