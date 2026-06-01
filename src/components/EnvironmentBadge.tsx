import './EnvironmentBadge.css';

type EnvironmentKind = 'local' | 'production' | 'staging';

function detectEnvironment(): { kind: EnvironmentKind; label: string; detail: string } {
  const { hostname, pathname, port } = window.location;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  const isProduction = hostname === 'jupanula.github.io' && pathname.startsWith('/NummirockGenerator');

  if (isLocal) {
    return {
      kind: 'local',
      label: 'LOCALHOST',
      detail: port ? `${hostname}:${port}` : hostname,
    };
  }

  if (isProduction) {
    return {
      kind: 'production',
      label: 'PRODUCTION',
      detail: hostname,
    };
  }

  return {
    kind: 'staging',
    label: 'STAGING',
    detail: hostname,
  };
}

export default function EnvironmentBadge() {
  const env = detectEnvironment();

  return (
    <span className={`env-badge env-badge-${env.kind}`} title={env.detail}>
      {env.label}
    </span>
  );
}
