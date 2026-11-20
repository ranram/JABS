const releasesUrl = 'https://github.com/ranram/jabs/releases';

const installerNames = {
  windows: /[-_](?:x64|x86_64)(?:-setup)?\.exe$/i,
  'mac-arm': /[-_](?:aarch64|arm64)\.dmg$/i,
  'mac-intel': /[-_](?:x64|x86_64)\.dmg$/i,
  'linux-deb': /[-_](?:amd64|x64|x86_64)\.deb$/i,
  'linux-rpm': /[._-](?:amd64|x64|x86_64)\.rpm$/i,
  'linux-appimage': /[-_](?:amd64|x64|x86_64)\.appimage$/i
};

function showInstallers(release) {
  const platforms = document.querySelector('.download-platforms');
  if (!platforms || !Array.isArray(release.assets)) return;

  const names = release.assets
    .filter((asset) => asset?.state === 'uploaded' && typeof asset.name === 'string' && /^jabs[-_]/i.test(asset.name))
    .map((asset) => asset.name);
  for (const link of platforms.querySelectorAll('[data-download]')) {
    const pattern = installerNames[link.dataset.download];
    const name = names.find((candidate) => pattern.test(candidate));
    if (!name) continue;
    link.href = `${releasesUrl}/download/${release.tag_name}/${encodeURIComponent(name)}`;
    link.closest('li').hidden = false;
  }
  for (const platform of platforms.querySelectorAll('.download-platform:not(.download-plugin)')) {
    platform.hidden = !platform.querySelector('li:not([hidden])');
  }
  platforms.hidden = !platforms.querySelector('.download-platform:not([hidden])');
}

async function showLatestRelease() {
  try {
    const response = await fetch('https://api.github.com/repos/ranram/jabs/releases/latest', { credentials: 'omit' });
    if (!response.ok) return;

    const release = await response.json();
    if (typeof release.tag_name !== 'string' || !/^v?\d+\.\d+\.\d+$/.test(release.tag_name)) return;
    if (typeof release.published_at !== 'string') return;
    const published = new Date(release.published_at);
    if (!Number.isFinite(published.getTime())) return;

    const banner = document.querySelector('.release-banner');
    const version = banner.querySelector('.release-banner-version');
    const date = banner.querySelector('time');
    const link = banner.querySelector('.release-banner-link');
    version.textContent = `JABS ${release.tag_name}`;
    date.textContent = new Intl.DateTimeFormat(document.documentElement.lang, {
      dateStyle: 'long',
      timeZone: 'UTC'
    }).format(published);
    date.dateTime = published.toISOString().slice(0, 10);
    link.href = `${releasesUrl}/tag/${release.tag_name}`;
    version.hidden = false;
    date.hidden = false;
    showInstallers(release);
  } catch {
    // The GitHub release links still work if the API is unavailable.
  }
}

void showLatestRelease();
