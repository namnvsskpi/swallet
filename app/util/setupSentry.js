/* eslint-disable import/no-namespace */
import * as Sentry from '@sentry/react-native';
import { Dedupe, ExtraErrorData } from '@sentry/integrations';

const METAMASK_ENVIRONMENT = process.env['METAMASK_ENVIRONMENT'] || 'local'; // eslint-disable-line dot-notation
const SENTRY_DSN_PROD =
  'https://4668e9f94dfa484e8f06d576f14d4451@o1271628.ingest.sentry.io/6464189'; // metamask-mobile
const SENTRY_DSN_DEV =
  'https://4668e9f94dfa484e8f06d576f14d4451@o1271628.ingest.sentry.io/6464189'; // test-metamask-mobile
/**
 * Required instrumentation for Sentry Performance to work with React Navigation
 */
export const routingInstrumentation =
  new Sentry.ReactNavigationV5Instrumentation();

// Setup sentry remote error reporting
export default function setupSentry() {
  const environment =
    __DEV__ || !METAMASK_ENVIRONMENT ? 'development' : METAMASK_ENVIRONMENT;
  const dsn = environment === 'production' ? SENTRY_DSN_PROD : SENTRY_DSN_DEV;
  Sentry.init({
    dsn,
    debug: __DEV__,
    environment,
    integrations: [
      new Dedupe(),
      new ExtraErrorData(),
      new Sentry.ReactNativeTracing({
        routingInstrumentation,
      }),
    ],
    tracesSampleRate: 0.2,
  });
}
