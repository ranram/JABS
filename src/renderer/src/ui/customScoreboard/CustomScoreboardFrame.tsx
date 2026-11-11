type Props = { frameUrl: string; inset: number };

export function CustomScoreboardFrame({ frameUrl, inset }: Props) {
  const image = (top = false) => (
    <img
      className="custom-scoreboard-frame"
      src={frameUrl}
      draggable={false}
      style={top ? { top: `${inset / 10.8}%` } : undefined}
      alt=""
      aria-hidden="true"
    />
  );
  if (!inset) return image();
  return (
    <>
      <div className="custom-scoreboard-frame-top">{image(true)}</div>
      <div className="custom-scoreboard-frame-bottom">{image()}</div>
    </>
  );
}
