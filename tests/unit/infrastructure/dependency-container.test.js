/**
 * Unit tests for DependencyContainer
 * Tests dependency injection container functionality including service registration,
 * resolution, singleton behavior, and circular dependency detection.
 */

import { DependencyContainer } from '../../../src/infrastructure/dependency-container.js';

describe('DependencyContainer', () => {
  let container;

  beforeEach(() => {
    container = new DependencyContainer();
  });

  afterEach(() => {
    if (container) {
      container.clearInstances();
    }
  });

  describe('Service Registration', () => {
    test('should register a service with factory function', () => {
      const factory = () => ({ value: 'test' });
      
      container.register('testService', factory);
      
      expect(container.isRegistered('testService')).toBe(true);
    });

    test('should register singleton service by default', () => {
      const factory = () => ({ value: 'test' });
      
      container.register('testService', factory);
      
      const instance1 = container.resolve('testService');
      const instance2 = container.resolve('testService');
      
      expect(instance1).toBe(instance2);
    });

    test('should register singleton service explicitly', () => {
      const factory = () => ({ value: 'test' });
      
      container.registerSingleton('testService', factory);
      
      const instance1 = container.resolve('testService');
      const instance2 = container.resolve('testService');
      
      expect(instance1).toBe(instance2);
    });

    test('should register transient service', () => {
      const factory = () => ({ value: Math.random() });
      
      container.registerTransient('testService', factory);
      
      const instance1 = container.resolve('testService');
      const instance2 = container.resolve('testService');
      
      expect(instance1).not.toBe(instance2);
      expect(instance1.value).not.toBe(instance2.value);
    });

    test('should register instance directly', () => {
      const instance = { value: 'direct' };
      
      container.registerInstance('testService', instance);
      
      expect(container.resolve('testService')).toBe(instance);
    });

    test('should throw error for invalid token type', () => {
      expect(() => {
        container.register(123, () => {});
      }).toThrow('Service token must be a string');
    });

    test('should throw error for invalid factory type', () => {
      expect(() => {
        container.register('testService', 'not-a-function');
      }).toThrow('Service factory must be a function');
    });

    test('should return container for method chaining', () => {
      const result = container.register('test1', () => {})
                             .register('test2', () => {});
      
      expect(result).toBe(container);
    });
  });

  describe('Service Resolution', () => {
    test('should resolve registered service', () => {
      const expectedValue = { value: 'test' };
      container.register('testService', () => expectedValue);
      
      const resolved = container.resolve('testService');
      
      expect(resolved).toEqual(expectedValue);
    });

    test('should resolve direct instance', () => {
      const instance = { value: 'direct' };
      container.registerInstance('testService', instance);
      
      const resolved = container.resolve('testService');
      
      expect(resolved).toBe(instance);
    });

    test('should throw error for unregistered service', () => {
      expect(() => {
        container.resolve('nonExistentService');
      }).toThrow("Service 'nonExistentService' is not registered");
    });

    test('should throw error for invalid token type', () => {
      expect(() => {
        container.resolve(123);
      }).toThrow('Service token must be a string');
    });

    test('should throw error if factory returns undefined', () => {
      container.register('testService', () => undefined);
      
      expect(() => {
        container.resolve('testService');
      }).toThrow("Factory for 'testService' returned undefined");
    });

    test('should handle factory errors gracefully', () => {
      container.register('testService', () => {
        throw new Error('Factory error');
      });
      
      expect(() => {
        container.resolve('testService');
      }).toThrow("Failed to create instance of 'testService': Factory error");
    });
  });

  describe('Dependency Injection', () => {
    test('should resolve service with dependencies', () => {
      container.register('dependency', () => ({ value: 'dep' }));
      container.register('service', (container, dep) => ({
        dep,
        value: 'service'
      }), { dependencies: ['dependency'] });
      
      const resolved = container.resolve('service');
      
      expect(resolved.dep.value).toBe('dep');
      expect(resolved.value).toBe('service');
    });

    test('should resolve multiple dependencies', () => {
      container.register('dep1', () => ({ value: 'dep1' }));
      container.register('dep2', () => ({ value: 'dep2' }));
      container.register('service', (container, dep1, dep2) => ({
        dep1,
        dep2,
        value: 'service'
      }), { dependencies: ['dep1', 'dep2'] });
      
      const resolved = container.resolve('service');
      
      expect(resolved.dep1.value).toBe('dep1');
      expect(resolved.dep2.value).toBe('dep2');
    });

    test('should pass container as first parameter to factory', () => {
      container.register('service', (containerParam) => {
        expect(containerParam).toBe(container);
        return { value: 'test' };
      });
      
      container.resolve('service');
    });
  });

  describe('Container Management', () => {
    test('should check if service is registered', () => {
      expect(container.isRegistered('testService')).toBe(false);
      
      container.register('testService', () => {});
      expect(container.isRegistered('testService')).toBe(true);
    });

    test('should get all registered tokens', () => {
      container.register('service1', () => {});
      container.register('service2', () => {});
      container.registerInstance('instance1', {});
      
      const tokens = container.getRegisteredTokens();
      
      expect(tokens).toContain('service1');
      expect(tokens).toContain('service2');
      expect(tokens).toContain('instance1');
      expect(tokens).toHaveLength(3);
    });

    test('should clear all instances', () => {
      container.register('service1', () => ({ value: 'test1' }));
      container.register('service2', () => ({ value: 'test2' }));
      
      // Create instances
      const instance1 = container.resolve('service1');
      const instance2 = container.resolve('service2');
      
      container.clearInstances();
      
      // Should create new instances after clear
      const newInstance1 = container.resolve('service1');
      const newInstance2 = container.resolve('service2');
      
      expect(newInstance1).not.toBe(instance1);
      expect(newInstance2).not.toBe(instance2);
    });
  });

  describe('Scoped Containers', () => {
    test('should create scoped container', () => {
      container.register('service', () => ({ value: 'parent' }));
      
      const scoped = container.createScope();
      
      expect(scoped).toBeInstanceOf(DependencyContainer);
      expect(scoped.scoped).toBe(true);
      expect(scoped.isRegistered('service')).toBe(true);
    });

    test('should not share instances between parent and scoped', () => {
      container.register('service', () => ({ value: Math.random() }));
      
      const parentInstance = container.resolve('service');
      const scoped = container.createScope();
      const scopedInstance = scoped.resolve('service');
      
      expect(scopedInstance).not.toBe(parentInstance);
    });

    test('should copy service registrations to scoped container', () => {
      container.register('service1', () => ({ value: 'test1' }));
      container.register('service2', () => ({ value: 'test2' }));
      
      const scoped = container.createScope();
      
      expect(scoped.isRegistered('service1')).toBe(true);
      expect(scoped.isRegistered('service2')).toBe(true);
    });
  });

  describe('Disposal', () => {
    test('should dispose instances with dispose method', async () => {
      const disposeMock = jest.fn();
      const instance = { dispose: disposeMock };
      
      container.registerInstance('service', instance);
      
      await container.dispose();
      
      expect(disposeMock).toHaveBeenCalled();
    });

    test('should handle async dispose methods', async () => {
      const disposeMock = jest.fn().mockResolvedValue(undefined);
      const instance = { dispose: disposeMock };
      
      container.registerInstance('service', instance);
      
      await container.dispose();
      
      expect(disposeMock).toHaveBeenCalled();
    });

    test('should handle dispose errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const disposeMock = jest.fn().mockImplementation(() => {
        throw new Error('Dispose error');
      });
      const instance = { dispose: disposeMock };
      
      container.registerInstance('service', instance);
      
      await expect(container.dispose()).resolves.not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith('Error disposing instance:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });

    test('should clear instances after disposal', async () => {
      const instance = { dispose: jest.fn() };
      container.registerInstance('service', instance);
      
      await container.dispose();
      
      expect(container.isRegistered('service')).toBe(false);
    });
  });

  describe('Validation', () => {
    test('should validate container with no dependencies', () => {
      container.register('service1', () => ({}));
      container.register('service2', () => ({}));
      
      expect(() => container.validate()).not.toThrow();
      expect(container.validate()).toBe(true);
    });

    test('should validate container with valid dependencies', () => {
      container.register('dependency', () => ({}));
      container.register('service', (container, dep) => ({ dep }), { 
        dependencies: ['dependency'] 
      });
      
      expect(() => container.validate()).not.toThrow();
      expect(container.validate()).toBe(true);
    });

    test('should detect missing dependencies', () => {
      container.register('service', (container, dep) => ({ dep }), { 
        dependencies: ['missingDependency'] 
      });
      
      expect(() => container.validate()).toThrow(
        "Dependency 'missingDependency' required by 'service' is not registered"
      );
    });

    test('should detect circular dependencies', () => {
      container.register('service1', (container, dep) => ({ dep }), { 
        dependencies: ['service2'] 
      });
      container.register('service2', (container, dep) => ({ dep }), { 
        dependencies: ['service1'] 
      });
      
      expect(() => container.validate()).toThrow(
        expect.stringMatching(/Circular dependency detected involving/)
      );
    });

    test('should detect complex circular dependencies', () => {
      container.register('serviceA', (container, dep) => ({ dep }), { 
        dependencies: ['serviceB'] 
      });
      container.register('serviceB', (container, dep) => ({ dep }), { 
        dependencies: ['serviceC'] 
      });
      container.register('serviceC', (container, dep) => ({ dep }), { 
        dependencies: ['serviceA'] 
      });
      
      expect(() => container.validate()).toThrow(
        expect.stringMatching(/Circular dependency detected/)
      );
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty container', () => {
      expect(container.getRegisteredTokens()).toEqual([]);
      expect(() => container.validate()).not.toThrow();
    });

    test('should handle service with no dependencies', () => {
      container.register('service', () => ({ value: 'test' }), { dependencies: [] });
      
      const resolved = container.resolve('service');
      expect(resolved.value).toBe('test');
    });

    test('should handle service registration options', () => {
      const factory = () => ({ value: 'test' });
      
      container.register('service', factory, { 
        singleton: false, 
        dependencies: [],
        customOption: 'ignored'
      });
      
      expect(container.isRegistered('service')).toBe(true);
    });

    test('should prioritize direct instances over registered services', () => {
      const factoryResult = { source: 'factory' };
      const directInstance = { source: 'direct' };
      
      container.register('service', () => factoryResult);
      container.registerInstance('service', directInstance);
      
      expect(container.resolve('service')).toBe(directInstance);
    });
  });
});