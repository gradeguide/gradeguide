import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Disable Zone.js patching of MessagePort and Worker BEFORE importing zone.js
globalThis.__Zone_disable_MessagePort = true;
globalThis.__Zone_disable_Worker = true;

// 1. Load polyfills dynamically AFTER setting flags on globalThis
await import('reflect-metadata');
await import('zone.js');

// 2. Instantiate Jasmine and expose jasmine / getEnv on globalThis
const Jasmine = (await import('jasmine')).default;
const jasmineRunner = new Jasmine();
jasmineRunner.exitOnCompletion = false;

const globalObj = globalThis;
const env = jasmineRunner.env;
globalObj.jasmine = jasmineRunner.jasmine || {};
globalObj.jasmine.getEnv = () => env;

// 3. Load zone.js/testing NOW so it patches jasmine environment methods
await import('zone.js/testing');

// 4. Bind Jasmine globals to globalThis AFTER zone.js/testing has patched them
globalObj.describe = env.describe.bind(env);
globalObj.xdescribe = env.xdescribe.bind(env);
globalObj.fdescribe = env.fdescribe.bind(env);
globalObj.it = env.it.bind(env);
globalObj.xit = env.xit.bind(env);
globalObj.fit = env.fit.bind(env);
globalObj.beforeEach = env.beforeEach.bind(env);
globalObj.afterEach = env.afterEach.bind(env);
globalObj.beforeAll = env.beforeAll.bind(env);
globalObj.afterAll = env.afterAll.bind(env);
globalObj.expect = env.expect.bind(env);
globalObj.spyOn = env.spyOn.bind(env);
globalObj.spyOnProperty = env.spyOnProperty.bind(env);

// 5. Instantiate JSDOM browser environment
const { JSDOM } = await import('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
  runScripts: 'dangerously',
});

globalObj.window = dom.window;
globalObj.document = dom.window.document;
// Node 21+ defines a getter-only navigator global, so plain assignment throws.
Object.defineProperty(globalObj, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalObj.HTMLElement = dom.window.HTMLElement;
globalObj.Element = dom.window.Element;
globalObj.Node = dom.window.Node;
globalObj.CustomEvent = dom.window.CustomEvent;
globalObj.Event = dom.window.Event;
globalObj.MouseEvent = dom.window.MouseEvent;
globalObj.PopStateEvent = dom.window.PopStateEvent;
globalObj.Location = dom.window.Location;
globalObj.History = dom.window.History;
globalObj.localStorage = dom.window.localStorage;
globalObj.sessionStorage = dom.window.sessionStorage;
globalObj.MutationObserver = dom.window.MutationObserver;
globalObj.getComputedStyle = dom.window.getComputedStyle ? dom.window.getComputedStyle.bind(dom.window) : () => ({});

// Connect JSDOM window timer methods to Zone-patched Node global timers
dom.window.setTimeout = globalObj.setTimeout;
dom.window.clearTimeout = globalObj.clearTimeout;
dom.window.setInterval = globalObj.setInterval;
dom.window.clearInterval = globalObj.clearInterval;

globalObj.requestAnimationFrame = (cb) => globalObj.setTimeout(cb, 0);
globalObj.cancelAnimationFrame = (id) => globalObj.clearTimeout(id);

// 6. Initialize Angular TestBed TestEnvironment
const { TestBed } = await import('@angular/core/testing');
const {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} = await import('@angular/platform-browser-dynamic/testing');

try {
  TestBed.initTestEnvironment(
    BrowserDynamicTestingModule,
    platformBrowserDynamicTesting()
  );
} catch (e) {
  // Environment might already be initialized
}

// Angular 21 made TestBed zoneless by default. The specs were written against
// zone-based change detection, so keep it until they are migrated.
const { provideZoneChangeDetection } = await import('@angular/core');
globalObj.beforeEach(() => {
  TestBed.configureTestingModule({ providers: [provideZoneChangeDetection()] });
});

globalObj.afterEach(() => {
  try {
    TestBed.resetTestingModule();
  } catch (e) {
    // Ignore if not initialized
  }
});

// 7. Load spec file(s) passed via process.argv relative to cwd
const specFiles = process.argv.slice(2);
if (specFiles.length === 0) {
  console.error('Error: No spec files provided to angular_spec_runner');
  process.exit(1);
}

for (const specFile of specFiles) {
  const absolutePath = path.isAbsolute(specFile)
    ? specFile
    : path.resolve(process.cwd(), specFile);
  await import(pathToFileURL(absolutePath).href);
}

const result = await jasmineRunner.execute();
if (result && (result.overallStatus === 'passed' || result === 'passed')) {
  process.exit(0);
} else {
  process.exit(1);
}
