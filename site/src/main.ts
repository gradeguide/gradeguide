// The Angular packages ship partly compiled and are not run through the
// Angular linker here, so the JIT compiler finishes them in the browser.
import '@angular/compiler';
import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';

import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, { providers: [provideZonelessChangeDetection()] }).catch((e) => console.error(e));
