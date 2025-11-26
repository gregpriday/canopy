import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

// We need to test the logger module's IS_DEBUG behavior, which is determined at module load time.
// Since IS_DEBUG is set when the module is first imported, we need to test this by:
// 1. Clearing the module cache
// 2. Setting up environment variables
// 3. Re-importing the module

describe('logger - CANOPY_DEBUG environment variable', () => {
  let originalNodeEnv: string | undefined;
  let originalCanopyDebug: string | undefined;
  let consoleLogSpy: Mock;
  let consoleWarnSpy: Mock;
  let consoleErrorSpy: Mock;

  beforeEach(() => {
    // Save original environment variables
    originalNodeEnv = process.env.NODE_ENV;
    originalCanopyDebug = process.env.CANOPY_DEBUG;

    // Set up console spies
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original environment variables
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }

    if (originalCanopyDebug !== undefined) {
      process.env.CANOPY_DEBUG = originalCanopyDebug;
    } else {
      delete process.env.CANOPY_DEBUG;
    }

    // Restore console spies
    vi.restoreAllMocks();

    // Clear the module cache to allow re-importing with new env vars
    vi.resetModules();
  });

  it('enables debug logging when CANOPY_DEBUG is set', async () => {
    // Set up environment before importing
    delete process.env.NODE_ENV;
    process.env.CANOPY_DEBUG = '1';

    // Dynamically import to pick up new env vars
    const { logDebug } = await import('../../src/utils/logger.js');

    logDebug('Test debug message', { testKey: 'testValue' });

    expect(consoleLogSpy).toHaveBeenCalled();
    expect(consoleLogSpy.mock.calls[0][0]).toContain('[DEBUG]');
    expect(consoleLogSpy.mock.calls[0][0]).toContain('Test debug message');
  });

  it('enables debug logging when NODE_ENV is development', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.CANOPY_DEBUG;

    const { logDebug } = await import('../../src/utils/logger.js');

    logDebug('Development debug message');

    expect(consoleLogSpy).toHaveBeenCalled();
    expect(consoleLogSpy.mock.calls[0][0]).toContain('[DEBUG]');
  });

  it('disables debug logging when neither CANOPY_DEBUG nor development mode is set', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CANOPY_DEBUG;

    const { logDebug } = await import('../../src/utils/logger.js');

    logDebug('Should not appear');

    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('disables all logging in test mode (NODE_ENV=test)', async () => {
    process.env.NODE_ENV = 'test';
    process.env.CANOPY_DEBUG = '1'; // Even with CANOPY_DEBUG set

    const { logDebug, logInfo, logWarn } = await import('../../src/utils/logger.js');

    logDebug('Test debug message');
    logInfo('Test info message');
    logWarn('Test warn message');

    // All should be suppressed in test mode
    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('logs errors even in production mode', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CANOPY_DEBUG;

    const { logError } = await import('../../src/utils/logger.js');

    logError('Test error message', new Error('Test error'));

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('[ERROR]');
  });

  it('suppresses errors in test mode', async () => {
    process.env.NODE_ENV = 'test';

    const { logError } = await import('../../src/utils/logger.js');

    logError('Test error message', new Error('Test error'));

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('enables info logging when CANOPY_DEBUG is set', async () => {
    delete process.env.NODE_ENV;
    process.env.CANOPY_DEBUG = '1';

    const { logInfo } = await import('../../src/utils/logger.js');

    logInfo('Test info message');

    expect(consoleLogSpy).toHaveBeenCalled();
    expect(consoleLogSpy.mock.calls[0][0]).toContain('[INFO]');
  });

  it('enables warn logging when CANOPY_DEBUG is set', async () => {
    delete process.env.NODE_ENV;
    process.env.CANOPY_DEBUG = '1';

    const { logWarn } = await import('../../src/utils/logger.js');

    logWarn('Test warn message');

    expect(consoleWarnSpy).toHaveBeenCalled();
    expect(consoleWarnSpy.mock.calls[0][0]).toContain('[WARN]');
  });

  it('redacts sensitive keys in log context', async () => {
    delete process.env.NODE_ENV;
    process.env.CANOPY_DEBUG = '1';

    const { logDebug } = await import('../../src/utils/logger.js');

    logDebug('Test message', {
      normalKey: 'visible',
      password: 'secret123',
      apiKey: 'sk-12345',
      token: 'bearer-token',
    });

    expect(consoleLogSpy).toHaveBeenCalled();
    const loggedContext = consoleLogSpy.mock.calls[0][1];
    expect(loggedContext).toContain('[redacted]');
    expect(loggedContext).toContain('visible');
    expect(loggedContext).not.toContain('secret123');
    expect(loggedContext).not.toContain('sk-12345');
    expect(loggedContext).not.toContain('bearer-token');
  });
});

describe('logger - YELLOWWOOD_DEBUG should not work (legacy)', () => {
  let originalNodeEnv: string | undefined;
  let originalYellowwoodDebug: string | undefined;
  let originalCanopyDebug: string | undefined;
  let consoleLogSpy: Mock;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    originalYellowwoodDebug = process.env.YELLOWWOOD_DEBUG;
    originalCanopyDebug = process.env.CANOPY_DEBUG;

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }

    if (originalYellowwoodDebug !== undefined) {
      process.env.YELLOWWOOD_DEBUG = originalYellowwoodDebug;
    } else {
      delete process.env.YELLOWWOOD_DEBUG;
    }

    if (originalCanopyDebug !== undefined) {
      process.env.CANOPY_DEBUG = originalCanopyDebug;
    } else {
      delete process.env.CANOPY_DEBUG;
    }

    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('YELLOWWOOD_DEBUG does NOT enable debug logging (legacy env var removed)', async () => {
    process.env.NODE_ENV = 'production';
    process.env.YELLOWWOOD_DEBUG = '1';
    delete process.env.CANOPY_DEBUG;

    const { logDebug } = await import('../../src/utils/logger.js');

    logDebug('Should not appear');

    // YELLOWWOOD_DEBUG should NOT enable logging anymore
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });
});
