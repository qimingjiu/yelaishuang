export default function Chat() {
  return (
    <section className="page">
      <h2>戏楼</h2>
      <p className="muted">一段连续的故事线就是一座戏楼。此模块尚未开工，当前为规划占位。</p>
      <div className="card">
        <h3>规划中的能力（见产品总纲）</h3>
        <ul className="plan-list">
          <li>楼层式对戏：流式回复、停止、重试、编辑双方内容、重生成、续写</li>
          <li>分支与存档：从任意楼层另开路线，状态与摘要随分支保存</li>
          <li>分层记忆：关键事实固定、阶段摘要、最近对话，可查看可纠正</li>
          <li>侧栏：角色、世界、记忆、状态（手机端抽屉式）</li>
          <li>戏录：按卷归档、全文检索、导出</li>
        </ul>
      </div>
    </section>
  );
}
