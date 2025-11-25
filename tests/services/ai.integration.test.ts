import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateProjectIdentity } from '../../src/services/ai/index.js';
import * as clientModule from '../../src/services/ai/client.js';

// Mock the client module
// We need to mock the module before importing the services that use it
vi.mock('../../src/services/ai/client.js', () => ({
  getAIClient: vi.fn()
}));

describe('AI Services Integration', () => {
  let mockCreate: any;

  beforeEach(() => {
    mockCreate = vi.fn();
    
    // Setup the mock client to return our mockCreate function for responses.create
    // We use vi.mocked to access the mocked function safely
    vi.mocked(clientModule.getAIClient).mockReturnValue({
      responses: {
        create: mockCreate
      }
    } as any);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('generateProjectIdentity', () => {
    it('should generate and parse identity correctly', async () => {
      const mockResponse = {
        emoji: '🚀',
        title: 'Rocket Project',
        gradientStart: '#ff0000',
        gradientEnd: '#00ff00'
      };

      mockCreate.mockResolvedValue({
        output_text: JSON.stringify(mockResponse)
      });

      const result = await generateProjectIdentity('/path/to/rocket-project');

      expect(result).toEqual(mockResponse);
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        model: 'gpt-5-mini',
        text: expect.objectContaining({
          format: expect.objectContaining({
            type: 'json_schema'
          })
        })
      }));
      
      // Verify the prompt contains the path/name
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.input).toContain('rocket-project');
    });

    it('should handle null/empty API response gracefully', async () => {
      mockCreate.mockResolvedValue({
        output_text: null
      });

      const result = await generateProjectIdentity('foo');
      expect(result).toBeNull();
    });

    it('should handle invalid JSON response gracefully', async () => {
      mockCreate.mockResolvedValue({
        output_text: 'invalid json { broken'
      });

      const result = await generateProjectIdentity('foo');
      expect(result).toBeNull();
    });
    
    it('should handle API errors gracefully', async () => {
      mockCreate.mockRejectedValue(new Error('API Error'));

      const result = await generateProjectIdentity('foo');
      expect(result).toBeNull();
    });
    
    it('should return null if client is not available (no API key)', async () => {
      vi.mocked(clientModule.getAIClient).mockReturnValue(null);
      
      const result = await generateProjectIdentity('foo');
      expect(result).toBeNull();
    });
  });

});
