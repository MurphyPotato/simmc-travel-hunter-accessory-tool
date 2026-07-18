import { ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ClipboardList,
  HelpCircle,
  ImageUp,
  Plus,
  RotateCcw,
  Swords,
  Target,
  Trash2,
  Upload,
} from "lucide-react";
import {
  Accessory,
  AccessoryQuality,
  AccessorySlot,
  Affix,
  DisplayStat,
  evaluateReplacement,
  evaluateSet,
  findBestSet,
  formatNumber,
  formatSigned,
  makeDefaultSet,
  maxLevelByQuality,
  qualityLabels,
  selectableStats,
  slotLabels,
  slots,
  statLabels,
  unlockedAffixSlots,
  WeaponMode,
  weaponLabels,
} from "./domain";
import { examples } from "./examples";
import { GUIDE_SEEN_KEY, HAS_GUIDE } from "./appConfig";
import { GuideDialog } from "./GuideDialog";
import { ParsedAccessory, recognizeAccessoryImage } from "./ocr";
import { legacyFixedAffixOptions } from "./legacyFixedAffixes";

type ImportTarget = "candidate" | "current";

const exampleGroups = [
  { id: "bow", label: "弓套示例" },
  { id: "sword", label: "剑套示例" },
  { id: "unfiltered", label: "候选样本" },
] as const;

function App() {
  const [weapon, setWeapon] = useState<WeaponMode>("bow");
  const [currentSet, setCurrentSet] = useState<Record<AccessorySlot, Accessory>>(() =>
    makeBowPreset(),
  );
  const [candidates, setCandidates] = useState<Accessory[]>([]);
  const [importTarget, setImportTarget] = useState<ImportTarget>("candidate");
  const [exampleGroup, setExampleGroup] = useState<(typeof exampleGroups)[number]["id"]>("bow");
  const [ocrProgress, setOcrProgress] = useState("");
  const [pendingImport, setPendingImport] = useState<ParsedAccessory | null>(null);
  const [ocrError, setOcrError] = useState("");
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [guideStep, setGuideStep] = useState(0);

  useEffect(() => {
    if (!HAS_GUIDE) return;
    if (window.localStorage.getItem(GUIDE_SEEN_KEY)) return;
    setGuideStep(0);
    setIsGuideOpen(true);
  }, []);

  const currentEvaluation = useMemo(
    () => evaluateSet(currentSet, weapon, legacyFixedAffixOptions),
    [currentSet, weapon],
  );
  const replacementResults = useMemo(
    () =>
      candidates
        .map((candidate) => evaluateReplacement(currentSet, candidate, weapon, legacyFixedAffixOptions))
        .sort((left, right) => right.delta - left.delta),
    [candidates, currentSet, weapon],
  );
  const bestSet = useMemo(
    () => findBestSet(currentSet, candidates, weapon, legacyFixedAffixOptions),
    [candidates, currentSet, weapon],
  );
  const bestDelta = bestSet.breakdown.expected - currentEvaluation.breakdown.expected;

  const selectedExamples = examples.filter((example) => example.group === exampleGroup);

  function updateCurrent(slot: AccessorySlot, next: Accessory) {
    setCurrentSet((previous) => ({
      ...previous,
      [slot]: { ...next, slot, id: previous[slot].id },
    }));
  }

  function updateCandidate(id: string, next: Accessory) {
    setCandidates((previous) => previous.map((item) => (item.id === id ? next : item)));
  }

  function addCandidate() {
    setCandidates((previous) => [
      createBlankAccessory("mainRing", "fine", 5, "手动候选"),
      ...previous,
    ]);
  }

  function removeCandidate(id: string) {
    setCandidates((previous) => previous.filter((item) => item.id !== id));
  }

  function loadPreset(mode: WeaponMode) {
    setWeapon(mode);
    setCurrentSet(mode === "bow" ? makeBowPreset() : makeSwordPreset());
  }

  async function runOcr(image: File | string, imageUrl: string) {
    setOcrError("");
    setOcrProgress("准备识别");
    setPendingImport(null);
    try {
      const parsed = await recognizeAccessoryImage(image, (progress) => {
        const pct = Math.round(progress.progress * 100);
        setOcrProgress(`${progress.status} ${pct}%`);
      });
      setPendingImport({
        ...parsed,
        accessory: {
          ...parsed.accessory,
          imageUrl,
        },
      });
      setOcrProgress("识别完成，等待确认");
    } catch (error) {
      setOcrError(error instanceof Error ? error.message : "OCR 识别失败");
      setOcrProgress("");
    }
  }

  function confirmImport() {
    if (!pendingImport) return;
    const accessory = {
      ...pendingImport.accessory,
      id: newId(),
      source: "ocr" as const,
    };

    if (importTarget === "current") {
      setCurrentSet((previous) => ({
        ...previous,
        [accessory.slot]: accessory,
      }));
    } else {
      setCandidates((previous) => [accessory, ...previous]);
    }
    setPendingImport(null);
    setOcrProgress("");
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    void runOcr(file, URL.createObjectURL(file));
    event.currentTarget.value = "";
  }

  function openGuide() {
    setGuideStep(0);
    setIsGuideOpen(true);
  }

  function closeGuide() {
    window.localStorage.setItem(GUIDE_SEEN_KEY, "true");
    setIsGuideOpen(false);
  }

  return (
    <main className="appShell">
      <header className="topBar">
        <div>
          <h1>旅行猎手饰品对比工具</h1>
          <p>按四件套约束计算剑/弓期望伤害，候选饰品只替换同部位。</p>
        </div>
        <div className="topActions">
          <SegmentedWeapon value={weapon} onChange={setWeapon} />
          {HAS_GUIDE && (
            <button className="ghostButton" type="button" onClick={openGuide}>
              <HelpCircle size={16} />
              教程
            </button>
          )}
          <button className="ghostButton" type="button" onClick={() => loadPreset("bow")}>
            <RotateCcw size={16} />
            弓示例
          </button>
          <button className="ghostButton" type="button" onClick={() => loadPreset("sword")}>
            <RotateCcw size={16} />
            剑示例
          </button>
        </div>
      </header>

      <section className="scoreStrip">
        <ScoreTile label="当前期望伤害" value={currentEvaluation.breakdown.expected} />
        <ScoreTile
          label="自动最佳四件套"
          value={bestSet.breakdown.expected}
          delta={bestDelta}
        />
        <ScoreTile label="暴击期望" value={currentEvaluation.breakdown.critChance * 100} suffix="%" />
        <ScoreTile label="减伤展示" value={currentEvaluation.breakdown.damageReduction} suffix="%" />
      </section>

      <div className="workspaceGrid">
        <section className="panel">
          <div className="panelHeader">
            <div>
              <h2>当前四件套</h2>
              <p>四个部位固定各一件，主词条自动计算。</p>
            </div>
          </div>
          <div className="accessoryGrid">
            {slots.map((slot) => (
              <AccessoryEditor
                key={slot}
                accessory={currentSet[slot]}
                lockedSlot={slot}
                onChange={(next) => updateCurrent(slot, next)}
              />
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panelHeader">
            <div>
              <h2>候选饰品</h2>
              <p>候选可多件同部位，自动最佳会从每个部位里挑一件。</p>
            </div>
            <button className="primaryButton" type="button" onClick={addCandidate}>
              <Plus size={16} />
              新增候选
            </button>
          </div>

          {candidates.length === 0 ? (
            <EmptyState onAdd={addCandidate} />
          ) : (
            <div className="candidateList">
              {candidates.map((candidate) => (
                <AccessoryEditor
                  key={candidate.id}
                  accessory={candidate}
                  onChange={(next) => updateCandidate(candidate.id, next)}
                  onRemove={() => removeCandidate(candidate.id)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="panel importPanel">
          <div className="panelHeader">
            <div>
              <h2>截图导入</h2>
              <p>OCR 结果会先进入复核表单，确认后再参与计算。</p>
            </div>
          </div>

          <div className="importControls">
            <label className="selectLabel">
              导入目标
              <select value={importTarget} onChange={(event) => setImportTarget(event.target.value as ImportTarget)}>
                <option value="candidate">加入候选列表</option>
                <option value="current">覆盖当前同部位</option>
              </select>
            </label>
            <label className="fileButton">
              <Upload size={16} />
              上传 tooltip 截图
              <input type="file" accept="image/*" onChange={handleFile} />
            </label>
          </div>

          <div className="groupTabs" role="tablist" aria-label="示例分组">
            {exampleGroups.map((group) => (
              <button
                key={group.id}
                className={group.id === exampleGroup ? "active" : ""}
                type="button"
                onClick={() => setExampleGroup(group.id)}
              >
                {group.label}
              </button>
            ))}
          </div>

          <div className="thumbnailGrid">
            {selectedExamples.map((example) => (
              <button
                key={example.id}
                className="thumbnailButton"
                type="button"
                onClick={() => void runOcr(example.url, example.url)}
                title={`识别 ${example.label}`}
              >
                <img src={example.url} alt={example.label} />
                <span>{example.label}</span>
              </button>
            ))}
          </div>

          {(ocrProgress || ocrError) && (
            <div className={ocrError ? "ocrStatus error" : "ocrStatus"}>
              {ocrError || ocrProgress}
            </div>
          )}

          {pendingImport && (
            <div className="reviewBox">
              <div className="reviewHeader">
                <div>
                  <h3>识别结果复核</h3>
                  <p>确认部位、品质、等级和值后再导入。</p>
                </div>
                <button className="primaryButton" type="button" onClick={confirmImport}>
                  <Check size={16} />
                  确认导入
                </button>
              </div>
              {pendingImport.warnings.length > 0 && (
                <div className="warningBox">
                  <AlertTriangle size={16} />
                  {pendingImport.warnings.join(" ")}
                </div>
              )}
              <AccessoryEditor
                accessory={pendingImport.accessory}
                onChange={(next) =>
                  setPendingImport((previous) =>
                    previous ? { ...previous, accessory: next } : previous,
                  )
                }
              />
              <details className="rawOcr">
                <summary>原始 OCR 文本</summary>
                <pre>{pendingImport.rawText}</pre>
              </details>
            </div>
          )}
        </section>

        <section className="panel resultsPanel">
          <div className="panelHeader">
            <div>
              <h2>结果</h2>
              <p>{weaponLabels[weapon]}配装，基础伤害 A = 10。</p>
            </div>
          </div>
          <BreakdownCard evaluation={currentEvaluation} weapon={weapon} />
          <BestSetCard current={currentEvaluation.breakdown.expected} best={bestSet} />
          <ReplacementTable results={replacementResults} />
        </section>
      </div>
      {HAS_GUIDE && isGuideOpen && (
        <GuideDialog
          step={guideStep}
          onStepChange={setGuideStep}
          onClose={closeGuide}
          onFinish={closeGuide}
        />
      )}
    </main>
  );
}

function SegmentedWeapon({
  value,
  onChange,
}: {
  value: WeaponMode;
  onChange: (value: WeaponMode) => void;
}) {
  return (
    <div className="segmented">
      <button
        type="button"
        className={value === "sword" ? "active" : ""}
        onClick={() => onChange("sword")}
      >
        <Swords size={16} />
        剑
      </button>
      <button
        type="button"
        className={value === "bow" ? "active" : ""}
        onClick={() => onChange("bow")}
      >
        <Target size={16} />
        弓
      </button>
    </div>
  );
}

function ScoreTile({
  label,
  value,
  suffix = "",
  delta,
}: {
  label: string;
  value: number;
  suffix?: string;
  delta?: number;
}) {
  return (
    <div className="scoreTile">
      <span>{label}</span>
      <strong>{formatNumber(value, 3)}{suffix}</strong>
      {typeof delta === "number" && (
        <em className={delta >= 0 ? "positiveText" : "negativeText"}>{formatSigned(delta, 3)}</em>
      )}
    </div>
  );
}

function AccessoryEditor({
  accessory,
  onChange,
  onRemove,
  lockedSlot,
}: {
  accessory: Accessory;
  onChange: (next: Accessory) => void;
  onRemove?: () => void;
  lockedSlot?: AccessorySlot;
}) {
  const maxLevel = maxLevelByQuality[accessory.quality];
  const unlocked = unlockedAffixSlots(accessory.quality, accessory.level);
  const tooManyAffixes = accessory.affixes.length > unlocked;

  function patch(patchValue: Partial<Accessory>) {
    onChange({ ...accessory, ...patchValue });
  }

  function updateAffix(id: string, patchValue: Partial<Affix>) {
    patch({
      affixes: accessory.affixes.map((affix) =>
        affix.id === id ? { ...affix, ...patchValue } : affix,
      ),
    });
  }

  function addAffix() {
    patch({
      affixes: [
        ...accessory.affixes,
        { id: newId(), stat: "hunterDamageMultiplier", value: 0 },
      ],
    });
  }

  function removeAffix(id: string) {
    patch({ affixes: accessory.affixes.filter((affix) => affix.id !== id) });
  }

  function changeQuality(quality: AccessoryQuality) {
    patch({
      quality,
      level: Math.min(accessory.level, maxLevelByQuality[quality]),
    });
  }

  return (
    <article className="accessoryCard">
      <div className="accessoryTop">
        <div className="identityFields">
          <input
            aria-label="饰品名称"
            value={accessory.name ?? ""}
            placeholder="饰品名称"
            onChange={(event) => patch({ name: event.target.value })}
          />
          {lockedSlot ? (
            <span className="slotBadge">{slotLabels[lockedSlot]}</span>
          ) : (
            <select
              aria-label="饰品部位"
              value={accessory.slot}
              onChange={(event) => patch({ slot: event.target.value as AccessorySlot })}
            >
              {slots.map((slot) => (
                <option key={slot} value={slot}>
                  {slotLabels[slot]}
                </option>
              ))}
            </select>
          )}
        </div>
        {onRemove && (
          <button className="iconButton danger" type="button" onClick={onRemove} title="删除">
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {accessory.imageUrl && (
        <img className="tooltipPreview" src={accessory.imageUrl} alt={accessory.name ?? "tooltip"} />
      )}

      <div className="metaGrid">
        <label>
          品质
          <select
            value={accessory.quality}
            onChange={(event) => changeQuality(event.target.value as AccessoryQuality)}
          >
            <option value="dim">黯淡</option>
            <option value="fine">精工</option>
            <option value="divine">神铸</option>
          </select>
        </label>
        <label>
          强化
          <input
            type="number"
            min={0}
            max={maxLevel}
            value={accessory.level}
            onChange={(event) =>
              patch({ level: clamp(Number(event.target.value), 0, maxLevel) })
            }
          />
        </label>
      </div>

      <div className="mainAffix">
        <span>固定主词条</span>
        <strong>{mainAffixText(accessory.slot)}</strong>
      </div>

      <div className="affixHeader">
        <span className={tooManyAffixes ? "limitWarning" : ""}>
          副词条 {accessory.affixes.length}/{unlocked}
        </span>
        <button className="smallButton" type="button" onClick={addAffix}>
          <Plus size={14} />
          添加
        </button>
      </div>

      <div className="affixList">
        {accessory.affixes.length === 0 ? (
          <div className="mutedLine">暂无副词条</div>
        ) : (
          accessory.affixes.map((affix) => (
            <div className="affixRow" key={affix.id}>
              <select
                value={affix.stat}
                onChange={(event) =>
                  updateAffix(affix.id, { stat: event.target.value as DisplayStat })
                }
              >
                {selectableStats.map((stat) => (
                  <option key={stat} value={stat}>
                    {statLabels[stat]}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                value={Number.isFinite(affix.value) ? affix.value : 0}
                onChange={(event) => updateAffix(affix.id, { value: Number(event.target.value) })}
              />
              <button
                className="iconButton"
                type="button"
                onClick={() => removeAffix(affix.id)}
                title="删除词条"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </article>
  );
}

function BreakdownCard({
  evaluation,
  weapon,
}: {
  evaluation: ReturnType<typeof evaluateSet>;
  weapon: WeaponMode;
}) {
  const breakdown = evaluation.breakdown;
  return (
    <div className="breakdown">
      <div className="metric">
        <span>非暴击</span>
        <strong>{formatNumber(breakdown.nonCrit, 3)}</strong>
      </div>
      <div className="metric">
        <span>暴击</span>
        <strong>{formatNumber(breakdown.crit, 3)}</strong>
      </div>
      <div className="metric">
        <span>{weaponLabels[weapon]}额外伤害</span>
        <strong>{formatNumber(breakdown.extraDamage, 3)}</strong>
      </div>
      <div className="metric">
        <span>{weaponLabels[weapon]}专精倍率</span>
        <strong>{formatNumber(breakdown.masteryMultiplier * 100, 2)}%</strong>
      </div>
      <div className="metric">
        <span>旅猎倍率</span>
        <strong>{formatNumber(breakdown.hunterMultiplier * 100, 2)}%</strong>
      </div>
      <div className="metric">
        <span>最终加伤</span>
        <strong>{formatNumber(breakdown.finalDamage, 3)}</strong>
      </div>
    </div>
  );
}

function BestSetCard({
  current,
  best,
}: {
  current: number;
  best: ReturnType<typeof evaluateSet>;
}) {
  const delta = best.breakdown.expected - current;
  return (
    <div className="bestBox">
      <div>
        <span className="sectionKicker">自动最佳</span>
        <strong>{formatNumber(best.breakdown.expected, 3)}</strong>
        <em className={delta >= 0 ? "positiveText" : "negativeText"}>
          {formatSigned(delta, 3)}
        </em>
      </div>
      <div className="bestSlots">
        {slots.map((slot) => (
          <span key={slot}>
            {slotLabels[slot]}：{best.accessories[slot].name || qualityLabels[best.accessories[slot].quality]}
          </span>
        ))}
      </div>
    </div>
  );
}

function ReplacementTable({ results }: { results: ReturnType<typeof evaluateReplacement>[] }) {
  if (results.length === 0) {
    return (
      <div className="emptyResults">
        <ClipboardList size={20} />
        添加候选后显示同部位替换结果。
      </div>
    );
  }

  return (
    <div className="resultTable">
      <div className="resultHead">
        <span>候选</span>
        <span>替换</span>
        <span>新伤害</span>
        <span>变化</span>
      </div>
      {results.map((result) => (
        <div className="resultRow" key={result.candidate.id}>
          <span>
            <strong>{result.candidate.name || qualityLabels[result.candidate.quality]}</strong>
            <em>{slotLabels[result.candidate.slot]}</em>
          </span>
          <span>{result.replaced.name || qualityLabels[result.replaced.quality]}</span>
          <span>{formatNumber(result.evaluation.breakdown.expected, 3)}</span>
          <span className={result.delta >= 0 ? "gain" : "loss"}>
            {result.delta >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
            {formatSigned(result.delta, 3)}
          </span>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="emptyState">
      <ImageUp size={26} />
      <p>可以手动新增候选，也可以从截图导入。</p>
      <button className="primaryButton" type="button" onClick={onAdd}>
        <Plus size={16} />
        新增候选
      </button>
    </div>
  );
}

function createBlankAccessory(
  slot: AccessorySlot,
  quality: AccessoryQuality,
  level: number,
  name: string,
): Accessory {
  return {
    id: newId(),
    slot,
    quality,
    level,
    name,
    affixes: [],
    source: "manual",
  };
}

function makeBowPreset(): Record<AccessorySlot, Accessory> {
  const bow = examples.filter((example) => example.group === "bow");
  return {
    mainRing: {
      ...createBlankAccessory("mainRing", "fine", 5, "弓套主戒指"),
      imageUrl: bow[3]?.url,
      source: "example",
      affixes: [
        { id: newId(), stat: "sneakSpeed", value: 0.01 },
        { id: newId(), stat: "bowExtraDamage", value: 8.95 },
      ],
    },
    subRing: {
      ...createBlankAccessory("subRing", "fine", 5, "弓套副戒指"),
      imageUrl: bow[1]?.url,
      source: "example",
      affixes: [
        { id: newId(), stat: "hunterCritChance", value: 5.5 },
        { id: newId(), stat: "hunterCritChance", value: 2.4 },
      ],
    },
    mainAmulet: {
      ...createBlankAccessory("mainAmulet", "fine", 5, "弓套主护符"),
      imageUrl: bow[2]?.url,
      source: "example",
      affixes: [
        { id: newId(), stat: "bowExtraDamage", value: 5 },
        { id: newId(), stat: "hunterDamageMultiplier", value: 0.07 },
      ],
    },
    subAmulet: {
      ...createBlankAccessory("subAmulet", "fine", 5, "弓套副护符"),
      imageUrl: bow[0]?.url,
      source: "example",
      affixes: [
        { id: newId(), stat: "hunterCritChance", value: 1.29 },
        { id: newId(), stat: "bowFinalDamage", value: 1.52 },
      ],
    },
  };
}

function makeSwordPreset(): Record<AccessorySlot, Accessory> {
  const sword = examples.filter((example) => example.group === "sword");
  return {
    mainRing: {
      ...createBlankAccessory("mainRing", "fine", 5, "剑套主戒指"),
      imageUrl: sword[1]?.url,
      source: "example",
      affixes: [
        { id: newId(), stat: "hunterCritChance", value: 2.15 },
        { id: newId(), stat: "swordMasteryMultiplier", value: 0.02 },
      ],
    },
    subRing: {
      ...createBlankAccessory("subRing", "divine", 8, "剑套副戒指"),
      imageUrl: sword[0]?.url,
      source: "example",
      affixes: [
        { id: newId(), stat: "swordMasteryMultiplier", value: 0.02 },
        { id: newId(), stat: "swordMasteryMultiplier", value: 0.02 },
        { id: newId(), stat: "vanilla", value: 0.26 },
      ],
    },
    mainAmulet: {
      ...createBlankAccessory("mainAmulet", "divine", 8, "剑套主护符"),
      imageUrl: sword[3]?.url,
      source: "example",
      affixes: [
        { id: newId(), stat: "swordMasteryMultiplier", value: 0.02 },
        { id: newId(), stat: "hunterCritChance", value: 1.58 },
        { id: newId(), stat: "damageReduction", value: 0.81 },
      ],
    },
    subAmulet: {
      ...createBlankAccessory("subAmulet", "fine", 5, "剑套副护符"),
      imageUrl: sword[2]?.url,
      source: "example",
      affixes: [
        { id: newId(), stat: "swordMasteryMultiplier", value: 0.02 },
        { id: newId(), stat: "hunterCritChance", value: 1.92 },
      ],
    },
  };
}

function mainAffixText(slot: AccessorySlot): string {
  const fixed = {
    mainRing: "旅猎暴击效果 +0.18",
    subRing: "旅猎暴击概率 +8.5",
    mainAmulet: "旅猎伤害加成倍率 +0.18",
    subAmulet: "百分比伤害减免 +2.5",
  } satisfies Record<AccessorySlot, string>;
  return fixed[slot];
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function newId(): string {
  if ("crypto" in globalThis && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

export default App;
