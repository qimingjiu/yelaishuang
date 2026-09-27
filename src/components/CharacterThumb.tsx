/**
 * 形象位：有 avatar 显示压缩后的立绘，没有则用名号首字做金石白文印。
 * size 控制各处尺寸（CSS 里的 thumb-* 变体）。
 */
export default function CharacterThumb({
  name,
  avatar,
  size = 'lib',
}: {
  name: string;
  avatar?: string;
  size?: 'lib' | 'pick' | 'head' | 'story' | 'tag';
}) {
  const cls = `lib-thumb thumb-${size}`;
  if (avatar) {
    return (
      <span className={cls}>
        <img src={avatar} alt="" draggable={false} />
      </span>
    );
  }
  return (
    <span className={`${cls} placeholder`} aria-hidden="true">
      <i>{name.slice(0, 1) || '戏'}</i>
    </span>
  );
}
