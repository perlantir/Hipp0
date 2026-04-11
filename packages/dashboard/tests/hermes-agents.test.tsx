/**
 * HermesAgents component tests.
 *
 * Mirrors the mocking pattern from new-components.test.tsx:
 *   - useApi and useProject are mocked at module level
 *   - All renders wrapped in act(async () => { ... })
 *   - waitFor for async assertions
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { act } from 'react';
import { vi, describe, it, beforeEach, expect } from 'vitest';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockDel = vi.fn();

// Shared mock project id — each test overrides before rendering.
const mockState = {
  projectId: 'not-a-uuid',
};

vi.mock('../src/hooks/useApi', () => ({
  useApi: () => ({
    get: mockGet,
    post: mockPost,
    patch: mockPatch,
    del: mockDel,
    baseUrl: 'http://localhost:3100',
  }),
}));

vi.mock('../src/App', () => ({
  useProject: () => ({ projectId: mockState.projectId, setProjectId: vi.fn() }),
}));

function resetMocks() {
  mockGet.mockReset();
  mockPost.mockReset();
  mockPatch.mockReset();
  mockDel.mockReset();
  mockGet.mockResolvedValue([]);
  mockState.projectId = 'not-a-uuid';
}

const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

describe('HermesAgents', () => {
  beforeEach(resetMocks);

  it('renders "Select a project" empty state when projectId is not a UUID', async () => {
    mockState.projectId = 'default';
    const { HermesAgents } = await import('../src/components/HermesAgents');
    await act(async () => {
      render(<HermesAgents />);
    });
    await waitFor(() => {
      expect(screen.getByText(/Select a project/i)).toBeTruthy();
    });
    // Should NOT call the API when project is invalid
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('calls /api/hermes/agents with project_id query param on mount with a valid UUID', async () => {
    mockState.projectId = VALID_UUID;
    mockGet.mockResolvedValue([]);
    const { HermesAgents } = await import('../src/components/HermesAgents');
    await act(async () => {
      render(<HermesAgents />);
    });
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(
        `/api/hermes/agents?project_id=${encodeURIComponent(VALID_UUID)}`,
      );
    });
  });

  it('renders "No agents registered yet" empty state when list is empty', async () => {
    mockState.projectId = VALID_UUID;
    mockGet.mockResolvedValue([]);
    const { HermesAgents } = await import('../src/components/HermesAgents');
    await act(async () => {
      render(<HermesAgents />);
    });
    await waitFor(() => {
      expect(screen.getByText(/No agents registered yet/i)).toBeTruthy();
    });
  });

  it('renders agent rows when list has entries', async () => {
    mockState.projectId = VALID_UUID;
    mockGet.mockResolvedValue([
      {
        agent_id: 'agent-1',
        agent_name: 'alice',
        config: { model: 'anthropic/claude-sonnet-4-6', toolset: 'sales' },
        created_at: '2026-04-11T00:00:00Z',
        updated_at: '2026-04-11T01:00:00Z',
      },
      {
        agent_id: 'agent-2',
        agent_name: 'bob',
        config: { model: 'anthropic/claude-opus-4-6' },
        created_at: '2026-04-10T00:00:00Z',
        updated_at: '2026-04-10T00:00:00Z',
      },
    ]);
    const { HermesAgents } = await import('../src/components/HermesAgents');
    await act(async () => {
      render(<HermesAgents />);
    });
    await waitFor(() => {
      expect(screen.getByText('alice')).toBeTruthy();
      expect(screen.getByText('bob')).toBeTruthy();
    });
  });

  it('loads agent detail when a row is clicked', async () => {
    mockState.projectId = VALID_UUID;
    mockGet
      .mockResolvedValueOnce([
        {
          agent_id: 'agent-1',
          agent_name: 'alice',
          config: { model: 'anthropic/claude-sonnet-4-6' },
          created_at: '2026-04-11T00:00:00Z',
          updated_at: '2026-04-11T00:00:00Z',
        },
      ])
      .mockResolvedValueOnce({
        agent_id: 'agent-1',
        agent_name: 'alice',
        soul: '# Alice\nYou are alice, a sales agent.',
        config: { model: 'anthropic/claude-sonnet-4-6' },
        created_at: '2026-04-11T00:00:00Z',
        updated_at: '2026-04-11T00:00:00Z',
      });

    const { HermesAgents } = await import('../src/components/HermesAgents');
    await act(async () => {
      render(<HermesAgents />);
    });
    await waitFor(() => {
      expect(screen.getByText('alice')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('alice'));
    });

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(
        `/api/hermes/agents/alice?project_id=${encodeURIComponent(VALID_UUID)}`,
      );
      // SOUL.md content should render
      expect(screen.getByText(/You are alice, a sales agent/i)).toBeTruthy();
    });
  });

  it('renders an error with Retry button on API failure', async () => {
    mockState.projectId = VALID_UUID;
    mockGet.mockRejectedValueOnce({ status: 500, message: 'boom' });
    const { HermesAgents } = await import('../src/components/HermesAgents');
    await act(async () => {
      render(<HermesAgents />);
    });
    await waitFor(() => {
      expect(screen.getByText(/boom/i)).toBeTruthy();
      expect(screen.getByText(/Retry/i)).toBeTruthy();
    });
  });
});
