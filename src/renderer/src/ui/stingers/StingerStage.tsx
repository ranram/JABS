import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { stingerFraming, winnerStingerFraming, stingerLimits, type StingerCue } from '@shared/stingers';
import type { SelectedSetState } from '@shared/models';
import { resolveGameProfile } from '@shared/gameProfiles';
import { api } from '../../api';
import { DisplayText } from '../DisplayText';
import { CatalogImage } from '../CatalogImage';
import { useStingerWinnerMedia } from './useStingerWinnerMedia';
import { useStingerWinnerAnimation } from './useStingerWinnerAnimation';
import { useStingerPlaybackClock } from './useStingerPlaybackClock';
import { useAppearanceStyle } from '../appearance/AppearanceProvider';
import { useIdentityTextFit } from '../useIdentityTextFit';
import './stingerStage.css';

export function StingerStage({
  cue,
  muted = false,
  onFinish
}: {
  cue: StingerCue;
  muted?: boolean;
  onFinish(error?: string): void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const appearanceStyle = useAppearanceStyle();
  const themeClass = resolveGameProfile(cue.selectedSet?.gameId).overlay.themeClass;
  const finish = useRef(onFinish);
  finish.current = onFinish;
  const [url, setUrl] = useState<string>();
  const media = useStingerWinnerMedia(cue.kind === 'winner' ? cue.selectedSet : undefined);
  const clip = cue.settings[cue.kind];
  const clock = useStingerPlaybackClock(
    video,
    clip.durationSeconds,
    cue.kind === 'winner' && clip.durationSeconds !== undefined
  );
  const winnerRef = useStingerWinnerAnimation(
    clock,
    cue.kind === 'winner' && media.ready,
    cue.settings.mediaDelaySeconds,
    clip.durationSeconds
  );

  useEffect(() => {
    const element = video.current;
    return () => {
      if (!element) return;
      element.pause();
      element.removeAttribute('src');
      element.load();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    if (clip.video)
      void api.stingerVideoUrl(clip.video.id).then(
        (value) => {
          if (!disposed) setUrl(value);
        },
        () => {
          if (!disposed) finish.current('playback-failed');
        }
      );
    else finish.current('missing-video');
    return () => {
      disposed = true;
    };
  }, [clip.video?.id]);

  useEffect(() => {
    const element = video.current;
    if (!element || !url || !media.ready) return;
    let disposed = false;
    void element.play().catch(() => {
      if (!disposed) finish.current('playback-failed');
    });
    return () => {
      disposed = true;
      element.pause();
    };
  }, [url, media.ready]);

  useEffect(() => {
    // Includes loading and stalled playback, even if the media never emits ended.
    const deadline = window.setTimeout(
      () => finish.current('playback-timeout'),
      Math.max(0, Math.min(stingerLimits.cueLifetimeMs, cue.expiresAt - Date.now()))
    );
    return () => window.clearTimeout(deadline);
  }, [cue.expiresAt]);

  useEffect(() => {
    const availableClock = clock.current;
    if (!availableClock) return;
    const playback = availableClock;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function sync() {
      clearTimeout(timer);
      const remaining = (playback.duration() - playback.time()) * 1000;
      if (playback.finished() || remaining <= 0) finish.current();
      else if (playback.running() && playback.rate() > 0)
        timer = setTimeout(sync, Math.max(16, remaining / playback.rate()));
    }
    const unsubscribe = playback.subscribe(sync);
    sync();
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [clock, clip.durationSeconds, cue.kind]);

  return (
    <div
      className={`stinger-stage ${themeClass}${cue.kind === 'winner' && url && media.ready ? ' stinger-cinematic' : ''}${cue.settings.videoLayer === 'foreground' ? ' stinger-video-foreground' : ''}`}
      style={appearanceStyle}
    >
      <video
        ref={video}
        src={url}
        muted={muted}
        playsInline
        preload="auto"
        onError={() => finish.current('playback-failed')}
      />
      {cue.kind === 'winner' && media.ready && (
        <div ref={winnerRef} className="stinger-winner" style={{ visibility: 'hidden' }}>
          <WinnerComposition media={media} />
        </div>
      )}
    </div>
  );
}

export function StingerFramingPreview({
  selectedSet,
  labels
}: {
  selectedSet?: SelectedSetState;
  labels: [string, string, string];
}) {
  const media = useStingerWinnerMedia(selectedSet);
  const appearanceStyle = useAppearanceStyle();
  const themeClass = resolveGameProfile(selectedSet?.gameId).overlay.themeClass;
  return (
    <div className={`stinger-stage stinger-cinematic ${themeClass}`} style={appearanceStyle}>
      <WinnerComposition media={media} />
      <FramingGuides
        labels={labels}
        framing={media.winner ? winnerStingerFraming(Boolean(media.photo), Boolean(media.character)) : stingerFraming}
        visible={media.winner ? { photo: Boolean(media.photo), character: Boolean(media.character) } : undefined}
      />
    </div>
  );
}

function WinnerComposition({ media }: { media: ReturnType<typeof useStingerWinnerMedia> }) {
  const framing = winnerStingerFraming(Boolean(media.photo), Boolean(media.character));
  const sponsor = media.winner?.prefix?.trim() || media.winner?.sponsor?.trim();
  const nameRef = useIdentityTextFit(`${sponsor ?? ''} ${media.winner?.name ?? ''}`, '.stinger-name-text');
  if (!media.winner) return null;
  return (
    <>
      {media.character && (
        <img className="stinger-character" src={media.character} alt="" style={regionStyle(framing.character)} />
      )}
      {media.photo && <img className="stinger-photo" src={media.photo} alt="" style={regionStyle(framing.photo)} />}

      <div className="stinger-name" style={regionStyle(framing.name)}>
        {media.sponsorLogo && <CatalogImage className="stinger-sponsor-logo" src={media.sponsorLogo} />}
        <strong ref={nameRef} className="stinger-name-row">
          <span className="stinger-name-text">
            {sponsor && (
              <>
                <span className="stinger-name-prefix">
                  <DisplayText text={sponsor} />
                </span>{' '}
              </>
            )}
            <span className="stinger-name-tag">
              <DisplayText text={media.winner.name} />
            </span>
          </span>
        </strong>
      </div>
    </>
  );
}

function FramingGuides({
  labels,
  framing,
  visible
}: {
  labels: [string, string, string];
  framing: ReturnType<typeof winnerStingerFraming>;
  visible?: { photo: boolean; character: boolean };
}) {
  return (
    <>
      {Object.entries(framing).map(([name, region], index) =>
        visible && name !== 'name' && !visible[name as 'photo' | 'character'] ? null : (
          <div className="stinger-guide" key={name} style={regionStyle(region)}>
            <span style={{ position: 'absolute', top: region.y < 0 ? `${(-region.y / region.height) * 100}%` : 0 }}>
              {labels[index]} · {region.x}, {region.y} · {region.width}×{region.height}
            </span>
          </div>
        )
      )}
    </>
  );
}

function regionStyle(region: { x: number; y: number; width: number; height: number }): CSSProperties {
  return {
    left: `${region.x / 19.2}%`,
    top: `${region.y / 10.8}%`,
    width: `${region.width / 19.2}%`,
    height: `${region.height / 10.8}%`
  };
}
