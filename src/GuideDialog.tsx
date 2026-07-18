import {
  Camera,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  HelpCircle,
  ListChecks,
  Swords,
  Trophy,
  X,
} from "lucide-react";

interface GuideDialogProps {
  step: number;
  onStepChange: (step: number) => void;
  onClose: () => void;
  onFinish: () => void;
}

const guideSteps = [
  {
    icon: Swords,
    title: "先选配装方向",
    body: "在右上角切换剑或弓。工具只会计算当前武器对应的专精、额外伤害和最终伤害词条。",
    hint: "弓词条不会提高剑评分，剑词条也不会提高弓评分。",
  },
  {
    icon: ListChecks,
    title: "填写当前四件套",
    body: "当前套装必须填满主戒指、副戒指、主护符、副护符各一件。固定主词条已经自动加入计算。",
    hint: "只需要补充品质、强化等级和副词条。",
  },
  {
    icon: ClipboardList,
    title: "录入副词条",
    body: "副词条可以重复，重复词条会累加。减伤、潜行速度和原版词条会保留展示，但不计入伤害。",
    hint: "品质和强化等级会用于检查副词条数量是否超过解锁上限。",
  },
  {
    icon: Trophy,
    title: "添加新刷候选",
    body: "刷到新饰品后，把它加入候选列表。每件候选只会替换相同部位的当前饰品。",
    hint: "可以录入多件同部位候选，自动最佳四件套会从里面挑最高伤害组合。",
  },
  {
    icon: Camera,
    title: "截图导入要复核",
    body: "上传 tooltip 截图或点击内置样本后，OCR 会先生成可编辑结果。确认部位、品质、等级和值再导入。",
    hint: "OCR 可能识别错字或数值，最终以你确认后的表单为准。",
  },
  {
    icon: HelpCircle,
    title: "查看最终判断",
    body: "结果区会显示当前期望伤害、每件候选替换后的变化，以及从当前装备和候选池中选出的自动最佳四件套。",
    hint: "变化为正代表伤害提升，变化为负代表换上会掉伤害。",
  },
];

export function GuideDialog({
  step,
  onStepChange,
  onClose,
  onFinish,
}: GuideDialogProps) {
  const safeStep = Math.min(Math.max(step, 0), guideSteps.length - 1);
  const current = guideSteps[safeStep];
  const Icon = current.icon;
  const isFirst = safeStep === 0;
  const isLast = safeStep === guideSteps.length - 1;

  return (
    <div className="guideOverlay" role="presentation">
      <section className="guideDialog" role="dialog" aria-modal="true" aria-labelledby="guide-title">
        <button className="guideClose" type="button" onClick={onClose} aria-label="关闭教程">
          <X size={18} />
        </button>

        <div className="guideHero">
          <div className="guideIcon">
            <Icon size={32} />
          </div>
          <div>
            <span className="guideKicker">教程 {safeStep + 1}/{guideSteps.length}</span>
            <h2 id="guide-title">{current.title}</h2>
          </div>
        </div>

        <p className="guideBody">{current.body}</p>
        <div className="guideHint">{current.hint}</div>

        <div className="guideProgress" aria-label="教程进度">
          {guideSteps.map((item, index) => (
            <button
              key={item.title}
              type="button"
              className={index === safeStep ? "active" : ""}
              onClick={() => onStepChange(index)}
              aria-label={`跳到第 ${index + 1} 步`}
            />
          ))}
        </div>

        <div className="guideActions">
          <button className="ghostButton" type="button" onClick={onClose}>
            跳过
          </button>
          <div className="guideNav">
            <button
              className="ghostButton"
              type="button"
              onClick={() => onStepChange(safeStep - 1)}
              disabled={isFirst}
            >
              <ChevronLeft size={16} />
              上一步
            </button>
            {isLast ? (
              <button className="primaryButton" type="button" onClick={onFinish}>
                完成
              </button>
            ) : (
              <button
                className="primaryButton"
                type="button"
                onClick={() => onStepChange(safeStep + 1)}
              >
                下一步
                <ChevronRight size={16} />
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
