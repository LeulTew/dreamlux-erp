import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdvancedStatsDashboard from './AdvancedStatsDashboard';
import * as api from '@/lib/api';

vi.mock('@/lib/api', () => ({
  getInventoryStats: vi.fn(),
}));
vi.mock('recharts', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ResponsiveContainer: ({ children }: any) => React.createElement('div', null, children),
  PieChart: () => React.createElement('div', null, 'PieChart'),
  Pie: () => React.createElement('div', null, 'Pie'),
  Cell: () => React.createElement('div', null, 'Cell'),
  BarChart: () => React.createElement('div', null, 'BarChart'),
  Bar: () => React.createElement('div', null, 'Bar'),
  XAxis: () => React.createElement('div', null, 'XAxis'),
  YAxis: () => React.createElement('div', null, 'YAxis'),
  CartesianGrid: () => React.createElement('div', null, 'CartesianGrid'),
  Tooltip: () => React.createElement('div', null, 'Tooltip'),
  Legend: () => React.createElement('div', null, 'Legend'),
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const mockStats = {
  totalItems: 156,
  totalEntries: 200,
  lowStockItems: 12,
  reconciledRecently: 180,
  stockPerLocation: [
    { location: 'Bulbula Coka', quantity: 56, lowStockItems: 4, totalEntries: 80, store_id: 's1' },
    { location: 'Bulbula 2', quantity: 44, lowStockItems: 3, totalEntries: 60, store_id: 's2' },
    { location: 'Haya Arat', quantity: 56, lowStockItems: 5, totalEntries: 60, store_id: 's3' },
  ],
};

describe('AdvancedStatsDashboard', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getInventoryStats').mockResolvedValue(mockStats);
  });

  it('renders overview stats correctly after loading', async () => {
    render(
      React.createElement(QueryClientProvider, { client: queryClient },
        React.createElement(AdvancedStatsDashboard, null)
      )
    );

    expect(await screen.findByText('156')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument(); // 180/200 = 0.9
  });

  it('switches to analytics tab when clicked', async () => {
    render(
      React.createElement(QueryClientProvider, { client: queryClient },
        React.createElement(AdvancedStatsDashboard, null)
      )
    );

    const analyticsTab = await screen.findByText('ANALYTICS');
    fireEvent.click(analyticsTab);

    expect(screen.getByText('Distribution by Store')).toBeInTheDocument();
    expect(screen.getByText('Stock Density Node')).toBeInTheDocument();
  });
});
