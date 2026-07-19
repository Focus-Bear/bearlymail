import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { ModalContent } from 'components/modal/ModalContent';

describe('ModalContent', () => {
  it('stops mousedown from bubbling to parent containers', () => {
    const onParentMouseDown = vi.fn();

    render(
      <div onMouseDown={onParentMouseDown}>
        <ModalContent>
          <button type="button">Inside modal</button>
        </ModalContent>
      </div>
    );

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Inside modal' }));

    expect(onParentMouseDown).not.toHaveBeenCalled();
  });
});
