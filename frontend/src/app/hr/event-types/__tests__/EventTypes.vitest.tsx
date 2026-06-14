/** @vitest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import EventCard from '../EventCard';
import { packMasonry, calculateCardHeight } from '@/lib/masonry-engine';
import { EventType } from '@/lib/types';

// Mock pretext as it likely requires a real DOM/Canvas for measurement
vi.mock('@chenglou/pretext', () => ({
  prepareWithSegments: vi.fn(() => ({})),
  measureLineStats: vi.fn(() => ({ lineCount: 1, maxLineWidth: 100 })),
}));

const mockEvent: EventType = {
  id: 'e1',
  event_name: 'Overtime Night',
  description: 'Night shift premium',
  created_at: '',
  updated_at: '',
  deleted_at: null
};

describe('EventCard Component', () => {
  const EventCardWrapper = (props: Omit<React.ComponentProps<typeof EventCard>, 'isEditing' | 'onEditStateChange'>) => {
    const [isEditing, setIsEditing] = React.useState(false);
    return (
      <EventCard 
        {...props} 
        isEditing={isEditing} 
        onEditStateChange={(config) => setIsEditing(config.isEditing)} 
      />
    );
  };

  it('renders event details correctly', () => {
    render(
      <EventCardWrapper 
        event={mockEvent}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        isUpdating={false}
      />
    );
    expect(screen.getByText(/Overtime Night/i)).toBeInTheDocument();
    expect(screen.getByText(/Night shift premium/i)).toBeInTheDocument();
  });

  it('enters editing mode and updates values', async () => {
    const onUpdateMock = vi.fn().mockResolvedValue(undefined);
    render(
      <EventCardWrapper 
        event={mockEvent}
        onUpdate={onUpdateMock}
        onDelete={vi.fn()}
        isUpdating={false}
      />
    );

    // Finding buttons with icons - we can use querySelector or better yet, accessible roles
    const buttons = screen.getAllByRole('button');
    // Button 0: Edit, Button 1: Delete
    fireEvent.click(buttons[0]);

    // Now it should be in editing mode
    const input = await screen.findByDisplayValue('Overtime Night');
    fireEvent.change(input, { target: { value: 'Night Shift' } });

    const textarea = screen.getByDisplayValue('Night shift premium');
    fireEvent.change(textarea, { target: { value: 'Updated description' } });

    // Save button is now reachable
    const saveBtn = screen.getByText(/SAVE/i);
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(onUpdateMock).toHaveBeenCalledWith('e1', expect.objectContaining({
        event_name: 'Night Shift',
        description: 'Updated description'
      }));
    });
  });
});

describe('Masonry Engine', () => {
  it('calculates height based on content', () => {
    const height = calculateCardHeight(mockEvent, 300);
    const eventNoDesc = { ...mockEvent, description: null };
    const heightNoDesc = calculateCardHeight(eventNoDesc, 300);
    
    expect(height).toBeGreaterThan(heightNoDesc);
  });

  it('packs items into columns correctly', () => {
    const params = { columns: 2, columnWidth: 300, gap: 16 };
    const events = [mockEvent, { ...mockEvent, id: 'e2' }];
    
    const result = packMasonry(events, params);
    
    expect(result.items).toHaveLength(2);
    expect(result.items[0].x).toBe(0);
    expect(result.items[1].x).toBe(316); // 300 + 16
  });
});
