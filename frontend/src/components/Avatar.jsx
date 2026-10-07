/** Initials in a softly tinted circle. The tint is derived from the name so a person always looks the same. */
export const initials = (name = '') =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';

const hue = (name = '') => {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
};

export default function Avatar({ name, size = 36 }) {
  return (
    <span className="avatar" style={{ '--h': hue(name), width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
