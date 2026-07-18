import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ClipboardPaste,
  ImageUp,
  Plus,
  RefreshCw,
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
  SetEvaluation,
  WeaponMode,
  evaluateSet,
  findBestSetFromPool,
  formatNumber,
  qualityLabels,
  selectableStats,
  slotLabels,
  slots,
  statLabels,
  totalAffixSlots,
  validateAffixValue,
  weaponLabels,
} from "./domain";
import { ParsedAccessory, recognizeAccessoryImage } from "./ocr";
import { loadAccessoryPoolFromFile, saveAccessoryPoolToFile, sanitizeAccessories } from "./v3Storage";
import { APP_VERSION } from "./appConfig";

type RecognitionStatus = "queued" | "recognizing" | "ready" | "error";

interface RecognitionItem {
  id: string;
  imageUrl: string;
  fileName: string;
  status: RecognitionStatus;
  progress: string;
  parsed: ParsedAccessory | null;
  error: string;
}

interface ComputedPlans {
  bow: SetEvaluation;
  sword: SetEvaluation;
}

interface SwapLogEntry {
  weapon: WeaponMode;
  slot: AccessorySlot;
  before?: Accessory;
  after?: Accessory;
}

type StorageStatus = "loading" | "ready" | "saving" | "error";
const hasFileStorage = APP_VERSION === "v3";

function AppV3() {
  const [recognitionItems, setRecognitionItems] = useState<RecognitionItem[]>([]);
  const [pool, setPool] = useState<Accessory[]>([]);
  const [plans, setPlans] = useState<ComputedPlans | null>(null);
  const [activePlan, setActivePlan] = useState<WeaponMode>("bow");
  const [swapLog, setSwapLog] = useState<SwapLogEntry[]>([]);
  const [pasteHint, setPasteHint] = useState("窗口在前台时可直接 Ctrl+V 粘贴截图。");
  const [storageStatus, setStorageStatus] = useState<StorageStatus>(hasFileStorage ? "loading" : "ready");
  const [storageMessage, setStorageMessage] = useState(
    hasFileStorage ? "正在读取工具目录 data/accessories-v3.json" : "",
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const poolLoadedRef = useRef(false);
  const storageAvailableRef = useRef(false);

  const activeEvaluation = plans?.[activePlan] ?? null;
  const usageById = useMemo(() => buildUsageMap(plans), [plans]);
  const activeSelectedIds = useMemo(() => {
    if (!activeEvaluation) return new Set<string>();
    return new Set(
      Object.values(activeEvaluation.accessories)
        .filter((item) => item.source !== "blank")
        .map((item) => item.id),
    );
  }, [activeEvaluation]);

  useEffect(() => {
    if (!hasFileStorage) {
      poolLoadedRef.current = true;
      storageAvailableRef.current = false;
      return;
    }
    let cancelled = false;
    void loadAccessoryPoolFromFile().then((result) => {
      if (cancelled) return;
      poolLoadedRef.current = true;
      storageAvailableRef.current = result.ok;
      if (result.ok) {
        const restored = result.accessories ?? [];
        setPool(restored);
        setStorageStatus("ready");
        setStorageMessage(`已从工具目录恢复 ${restored.length} 件已确认饰品。`);
      } else {
        setStorageStatus("error");
        setStorageMessage(`文件保存不可用：${result.error ?? "无法访问保存接口"}`);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasFileStorage || !poolLoadedRef.current || !storageAvailableRef.current) return;
    const handle = window.setTimeout(() => {
      setStorageStatus("saving");
      void saveAccessoryPoolToFile(pool).then((result) => {
        if (result.ok) {
          setStorageStatus("ready");
          setStorageMessage(`已保存 ${pool.length} 件饰品到工具目录 data/accessories-v3.json。`);
        } else {
          setStorageStatus("error");
          setStorageMessage(`保存失败：${result.error ?? "无法写入工具目录"}`);
        }
      });
    }, 250);
    return () => window.clearTimeout(handle);
  }, [pool]);

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const files = filesFromClipboard(event.clipboardData);
      if (files.length === 0) return;
      event.preventDefault();
      setPasteHint(`已粘贴 ${files.length} 张截图，正在加入待识别库。`);
      void enqueueFiles(files);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  async function enqueueFiles(files: File[]) {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    for (const file of imageFiles) {
      const id = newId();
      const imageUrl = await fileToDataUrl(file);
      const item: RecognitionItem = {
        id,
        imageUrl,
        fileName: file.name || "剪贴板截图",
        status: "queued",
        progress: "等待识别",
        parsed: null,
        error: "",
      };
      setRecognitionItems((previous) => [item, ...previous]);
      void runOcrForItem(id, file, imageUrl);
    }
  }

  async function runOcrForItem(id: string, file: File, imageUrl: string) {
    patchRecognition(id, { status: "recognizing", progress: "准备识别" });
    try {
      const parsed = await recognizeAccessoryImage(file, (progress) => {
        patchRecognition(id, {
          progress: `${progress.status} ${Math.round(progress.progress * 100)}%`,
        });
      });
      patchRecognition(id, {
        status: "ready",
        progress: "识别完成，等待复核",
        parsed: {
          ...parsed,
          accessory: {
            ...parsed.accessory,
            imageUrl,
          },
        },
      });
    } catch (error) {
      patchRecognition(id, {
        status: "error",
        progress: "识别失败，可手动复核",
        error: error instanceof Error ? error.message : "OCR 识别失败",
        parsed: {
          rawText: "",
          warnings: ["OCR 识别失败，请手动补全。"],
          accessory: createBlankEditableAccessory(imageUrl),
        },
      });
    }
  }

  function patchRecognition(id: string, patch: Partial<RecognitionItem>) {
    setRecognitionItems((previous) =>
      previous.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function updateParsedAccessory(id: string, accessory: Accessory) {
    setRecognitionItems((previous) =>
      previous.map((item) =>
        item.id === id && item.parsed
          ? { ...item, parsed: { ...item.parsed, accessory } }
          : item,
      ),
    );
  }

  function confirmRecognition(item: RecognitionItem) {
    if (!item.parsed) return;
    const accessory = {
      ...item.parsed.accessory,
      id: newId(),
      source: "ocr" as const,
    };
    setPool((previous) => sanitizeAccessories([accessory, ...previous]));
    setRecognitionItems((previous) => previous.filter((current) => current.id !== item.id));
    setPlans(null);
    setSwapLog([]);
  }

  function calculatePlans() {
    const previous = plans;
    const next: ComputedPlans = {
      bow: findBestSetFromPool(pool, "bow"),
      sword: findBestSetFromPool(pool, "sword"),
    };
    setPlans(next);
    setSwapLog(buildSwapLog(previous, next));
  }

  function clearPool() {
    setPool([]);
    setPlans(null);
    setSwapLog([]);
  }

  function removePoolItem(id: string) {
    setPool((previous) => previous.filter((item) => item.id !== id));
    setPlans(null);
    setSwapLog([]);
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    void enqueueFiles(Array.from(event.currentTarget.files ?? []));
    event.currentTarget.value = "";
  }

  function handlePasteButton() {
    setPasteHint("现在直接按 Ctrl+V 即可粘贴截图；不需要点击上传框。");
  }

  function handleDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    void enqueueFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <main className="appShell v3Shell">
      <header className="v3Top">
        <div>
          <h1>旅行猎手饰品仓库</h1>
          <p>上传或粘贴饰品截图，复核后入库，再自动计算剑套和弓套最高期望伤害。</p>
        </div>
        <div className="topActions">
          {hasFileStorage && <StorageBadge status={storageStatus} message={storageMessage} />}
          <button
            className="primaryButton"
            type="button"
            onClick={calculatePlans}
            disabled={pool.length === 0}
          >
            <RefreshCw size={16} />
            计算并替换
          </button>
        </div>
      </header>

      <section
        className="uploadDrop"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFile} />
        <ImageUp size={30} />
        <div>
          <strong>拖入截图，或直接 Ctrl+V 粘贴截图</strong>
          <span>{pasteHint}</span>
        </div>
        <div className="uploadActions">
          <button className="ghostButton" type="button" onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} />
            选择图片
          </button>
          <button className="ghostButton" type="button" onClick={handlePasteButton}>
            <ClipboardPaste size={16} />
            粘贴截图
          </button>
        </div>
      </section>

      <div className="v3Grid">
        <section className="panel v3Panel">
          <PanelTitle title="待识别饰品库" desc={`${recognitionItems.length} 张截图等待复核`} />
          {recognitionItems.length === 0 ? (
            <EmptyLine text="还没有待识别截图。直接 Ctrl+V 或点“选择图片”导入。" />
          ) : (
            <div className="reviewList">
              {recognitionItems.map((item) => (
                <ReviewCard
                  key={item.id}
                  item={item}
                  onChange={(next) => updateParsedAccessory(item.id, next)}
                  onConfirm={() => confirmRecognition(item)}
                  onRemove={() => setRecognitionItems((previous) => previous.filter((current) => current.id !== item.id))}
                />
              ))}
            </div>
          )}
        </section>

        <section className="panel v3Panel">
          <div className="panelHeader">
            <PanelTitle title="待选饰品库" desc={`${pool.length} 件已确认饰品`} />
            <button className="ghostButton" type="button" onClick={clearPool} disabled={pool.length === 0}>
              <Trash2 size={16} />
              清空
            </button>
          </div>
          {pool.length === 0 ? (
            <EmptyLine text="复核并确认至少一件饰品后，就可以计算剑套和弓套。" />
          ) : (
            <div className="poolList">
              {pool.map((item) => (
                <PoolCard
                  key={item.id}
                  accessory={item}
                  usage={usageById.get(item.id) ?? new Set()}
                  activeSelected={activeSelectedIds.has(item.id)}
                  onRemove={() => removePoolItem(item.id)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="panel v3Panel previewPanel">
          <div className="panelHeader">
            <PanelTitle title="方案预览" desc="分别计算剑套和弓套，切换查看实际应选饰品。" />
            <div className="segmented compact">
              <button
                type="button"
                className={activePlan === "sword" ? "active" : ""}
                onClick={() => setActivePlan("sword")}
              >
                <Swords size={16} />
                剑套
              </button>
              <button
                type="button"
                className={activePlan === "bow" ? "active" : ""}
                onClick={() => setActivePlan("bow")}
              >
                <Target size={16} />
                弓套
              </button>
            </div>
          </div>
          {!activeEvaluation ? (
            <EmptyLine text="点击“计算并替换”后展示最高期望伤害组合。" />
          ) : (
            <PlanPreview evaluation={activeEvaluation} weapon={activePlan} />
          )}

          <SwapLog entries={swapLog} />
        </section>
      </div>
    </main>
  );
}

function ReviewCard({
  item,
  onChange,
  onConfirm,
  onRemove,
}: {
  item: RecognitionItem;
  onChange: (accessory: Accessory) => void;
  onConfirm: () => void;
  onRemove: () => void;
}) {
  const accessory = item.parsed?.accessory;
  return (
    <article className="reviewCard">
      <div className="reviewCardTop">
        <div>
          <strong>{item.fileName}</strong>
          <span className={`statusPill ${item.status}`}>{item.progress}</span>
        </div>
        <button className="iconButton danger" type="button" onClick={onRemove} title="删除截图">
          <Trash2 size={15} />
        </button>
      </div>
      <img className="tooltipPreview large" src={item.imageUrl} alt={item.fileName} />
      {item.error && <div className="ocrStatus error">{item.error}</div>}
      {accessory ? (
        <>
          <AccessoryEditorV3 accessory={accessory} onChange={onChange} />
          {item.parsed?.warnings.length ? <div className="warningBox">{item.parsed.warnings.join(" ")}</div> : null}
          <details className="rawOcr">
            <summary>原始 OCR 文本</summary>
            <pre>{item.parsed?.rawText || "无 OCR 文本，可手动填写。"}</pre>
          </details>
          <button className="primaryButton fullWidth" type="button" onClick={onConfirm}>
            <Check size={16} />
            确认饰品
          </button>
        </>
      ) : (
        <EmptyLine text="OCR 识别中..." />
      )}
    </article>
  );
}

function AccessoryEditorV3({
  accessory,
  onChange,
}: {
  accessory: Accessory;
  onChange: (accessory: Accessory) => void;
}) {
  const totalSlots = totalAffixSlots(accessory.quality, accessory.level);
  const overLimit = accessory.affixes.length > totalSlots;

  function patch(patchValue: Partial<Accessory>) {
    onChange({ ...accessory, ...patchValue });
  }

  function updateAffix(id: string, patchValue: Partial<Affix>) {
    patch({
      affixes: accessory.affixes.map((affix) => {
        if (affix.id !== id) return affix;
        const next = { ...affix, ...patchValue };
        const warning = validateAffixValue(next.stat, next.value);
        return { ...next, warning, confidence: warning ? "low" : next.confidence };
      }),
    });
  }

  function addAffix() {
    patch({
      affixes: [...accessory.affixes, { id: newId(), stat: "vanilla", value: 0, confidence: "high" }],
    });
  }

  return (
    <div className="v3Editor">
      <div className="identityFields">
        <input
          aria-label="饰品名称"
          value={accessory.name ?? ""}
          onChange={(event) => patch({ name: event.target.value })}
        />
        <select
          aria-label="饰品部位"
          value={accessory.slot}
          onChange={(event) => patch({ slot: event.target.value as AccessorySlot })}
        >
          {slots.map((slot) => <option key={slot} value={slot}>{slotLabels[slot]}</option>)}
        </select>
      </div>
      <div className="metaGrid">
        <label>
          品质
          <select
            value={accessory.quality}
            onChange={(event) => patch({ quality: event.target.value as AccessoryQuality })}
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
            max={8}
            value={accessory.level}
            onChange={(event) => patch({ level: Number(event.target.value) })}
          />
        </label>
      </div>
      <div className="affixHeader">
        <span className={overLimit ? "limitWarning" : ""}>词条 {accessory.affixes.length}/{totalSlots}</span>
        <button className="smallButton" type="button" onClick={addAffix}>
          <Plus size={14} />
          添加
        </button>
      </div>
      <div className="affixList">
        {accessory.affixes.length === 0 ? (
          <div className="mutedLine">暂无词条，可手动添加。</div>
        ) : (
          accessory.affixes.map((affix) => (
            <div className={affix.confidence === "low" || affix.warning ? "affixRow lowConfidence" : "affixRow"} key={affix.id}>
              <select
                value={affix.stat}
                onChange={(event) => updateAffix(affix.id, { stat: event.target.value as DisplayStat })}
              >
                {selectableStats.map((stat) => <option key={stat} value={stat}>{statLabels[stat]}</option>)}
              </select>
              <input
                type="number"
                step="0.01"
                min={0}
                value={Number.isFinite(affix.value) ? affix.value : 0}
                onChange={(event) => updateAffix(affix.id, { value: Number(event.target.value) })}
                title={affix.warning}
              />
              <button
                className="iconButton"
                type="button"
                onClick={() => patch({ affixes: accessory.affixes.filter((item) => item.id !== affix.id) })}
                title="删除词条"
              >
                <Trash2 size={14} />
              </button>
              {affix.warning && <small>{affix.warning}</small>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PoolCard({
  accessory,
  usage,
  activeSelected,
  onRemove,
}: {
  accessory: Accessory;
  usage: Set<WeaponMode>;
  activeSelected: boolean;
  onRemove: () => void;
}) {
  const scoreBow = evaluateSet(poolSetForSingle(accessory), "bow").breakdown.expected;
  const scoreSword = evaluateSet(poolSetForSingle(accessory), "sword").breakdown.expected;
  return (
    <article className={activeSelected ? "poolCard selected" : "poolCard"}>
      {accessory.imageUrl && <img className="poolThumb" src={accessory.imageUrl} alt={accessory.name || "饰品截图"} />}
      <div className="poolCardBody">
        <div className="poolCardHeader">
          <div>
            <strong>{accessory.name || qualityLabels[accessory.quality]}</strong>
            <span>{slotLabels[accessory.slot]} / {qualityLabels[accessory.quality]} +{accessory.level}</span>
          </div>
          <button className="iconButton danger" type="button" onClick={onRemove} title="删除饰品">
            <Trash2 size={15} />
          </button>
        </div>
        <UsageBadge usage={usage} />
        <AffixSummary affixes={accessory.affixes} />
        <div className="miniMetrics">
          <span>弓 {formatNumber(scoreBow, 2)}</span>
          <span>剑 {formatNumber(scoreSword, 2)}</span>
        </div>
      </div>
    </article>
  );
}

function UsageBadge({ usage }: { usage: Set<WeaponMode> }) {
  if (usage.size === 0) return null;
  const text = usage.has("bow") && usage.has("sword")
    ? "剑/弓都使用中"
    : usage.has("sword")
      ? "剑套使用中"
      : "弓套使用中";
  return <em className="usageBadge">{text}</em>;
}

function AffixSummary({ affixes }: { affixes: Affix[] }) {
  if (affixes.length === 0) return <div className="mutedLine compactLine">无词条</div>;
  return (
    <ul className="affixSummary">
      {affixes.map((affix) => (
        <li key={affix.id} className={affix.warning ? "warn" : ""}>
          <span>{statLabels[affix.stat]}</span>
          <strong>+{formatNumber(affix.value, 3)}</strong>
        </li>
      ))}
    </ul>
  );
}

function PlanPreview({ evaluation, weapon }: { evaluation: SetEvaluation; weapon: WeaponMode }) {
  const breakdown = evaluation.breakdown;
  return (
    <div className="planPreview">
      <div className="planScore">
        <span>{weaponLabels[weapon]}套期望伤害</span>
        <strong>{formatNumber(breakdown.expected, 3)}</strong>
      </div>
      <div className="planMetrics">
        <span>非暴击 {formatNumber(breakdown.nonCrit, 3)}</span>
        <span>暴击 {formatNumber(breakdown.crit, 3)}</span>
        <span>暴击率 {formatNumber(breakdown.critChance * 100, 2)}%</span>
        <span>爆伤 {formatNumber(breakdown.critDamage * 100, 2)}%</span>
        <span>旅猎倍率 {formatNumber(breakdown.hunterMultiplier * 100, 2)}%</span>
        <span>专精倍率 {formatNumber(breakdown.masteryMultiplier * 100, 2)}%</span>
        <span>额外伤害 {formatNumber(breakdown.extraDamage, 2)}</span>
        <span>最终加伤 {formatNumber(breakdown.finalDamage, 2)}</span>
      </div>
      <div className="planSlots">
        {slots.map((slot) => {
          const item = evaluation.accessories[slot];
          return <PlanSlot key={slot} slot={slot} item={item} />;
        })}
      </div>
    </div>
  );
}

function PlanSlot({ slot, item }: { slot: AccessorySlot; item: Accessory }) {
  return (
    <div className={item.source === "blank" ? "planSlot blank" : "planSlot"}>
      {item.imageUrl && <img className="planThumb" src={item.imageUrl} alt={item.name || slotLabels[slot]} />}
      <div>
        <span>{slotLabels[slot]}</span>
        <strong>{item.name || qualityLabels[item.quality]}</strong>
        <em>{item.source === "blank" ? "空白占位" : `${qualityLabels[item.quality]} +${item.level}`}</em>
        {item.source !== "blank" && <AffixSummary affixes={item.affixes} />}
      </div>
    </div>
  );
}

function SwapLog({ entries }: { entries: SwapLogEntry[] }) {
  return (
    <div className="swapLog">
      <h3>交换日志</h3>
      {entries.length === 0 ? (
        <EmptyLine text="首次计算或方案未变化。" />
      ) : (
        entries.map((entry) => (
          <div className="swapRow" key={`${entry.weapon}-${entry.slot}-${entry.after?.id ?? "blank"}`}>
            <span>{weaponLabels[entry.weapon]} / {slotLabels[entry.slot]}</span>
            <div className="swapItems">
              <SwapItem item={entry.before} fallback="空白" />
              <strong>{"->"}</strong>
              <SwapItem item={entry.after} fallback="空白" />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function SwapItem({ item, fallback }: { item?: Accessory; fallback: string }) {
  if (!item) return <span>{fallback}</span>;
  return (
    <span className="swapItem">
      {item.imageUrl && <img src={item.imageUrl} alt={item.name || fallback} />}
      <b>{item.name || qualityLabels[item.quality]}</b>
    </span>
  );
}

function PanelTitle({ title, desc }: { title: string; desc: string }) {
  return (
    <div>
      <h2>{title}</h2>
      <p>{desc}</p>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="emptyState compactEmpty">{text}</div>;
}

function StorageBadge({ status, message }: { status: StorageStatus; message: string }) {
  return <span className={`storageBadge ${status}`}>{message}</span>;
}

function createBlankEditableAccessory(imageUrl: string): Accessory {
  return {
    id: newId(),
    name: "手动复核饰品",
    slot: "mainRing",
    quality: "fine",
    level: 0,
    affixes: [],
    source: "ocr",
    imageUrl,
  };
}

function poolSetForSingle(accessory: Accessory) {
  return {
    mainRing: accessory.slot === "mainRing" ? accessory : blank("mainRing"),
    subRing: accessory.slot === "subRing" ? accessory : blank("subRing"),
    mainAmulet: accessory.slot === "mainAmulet" ? accessory : blank("mainAmulet"),
    subAmulet: accessory.slot === "subAmulet" ? accessory : blank("subAmulet"),
  };
}

function blank(slot: AccessorySlot): Accessory {
  return {
    id: `blank-${slot}`,
    slot,
    quality: "dim",
    level: 0,
    name: "空白",
    affixes: [],
    source: "blank",
  };
}

function buildSwapLog(previous: ComputedPlans | null, next: ComputedPlans): SwapLogEntry[] {
  if (!previous) return [];
  const entries: SwapLogEntry[] = [];
  for (const weapon of ["sword", "bow"] as const) {
    for (const slot of slots) {
      const before = previous[weapon].accessories[slot];
      const after = next[weapon].accessories[slot];
      if (before.id !== after.id) {
        entries.push({
          weapon,
          slot,
          before: before.source === "blank" ? undefined : before,
          after: after.source === "blank" ? undefined : after,
        });
      }
    }
  }
  return entries;
}

function buildUsageMap(plans: ComputedPlans | null): Map<string, Set<WeaponMode>> {
  const map = new Map<string, Set<WeaponMode>>();
  if (!plans) return map;
  for (const weapon of ["bow", "sword"] as const) {
    for (const accessory of Object.values(plans[weapon].accessories)) {
      if (accessory.source === "blank") continue;
      const usage = map.get(accessory.id) ?? new Set<WeaponMode>();
      usage.add(weapon);
      map.set(accessory.id, usage);
    }
  }
  return map;
}

function filesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files = Array.from(data.files).filter((file) => file.type.startsWith("image/"));
  if (files.length > 0) return files;
  return Array.from(data.items)
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item, index) => {
      const file = item.getAsFile();
      if (!file) return null;
      return new File([file], file.name || `剪贴板截图-${index + 1}.png`, { type: file.type || "image/png" });
    })
    .filter((file): file is File => Boolean(file));
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

function newId(): string {
  if ("crypto" in globalThis && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

export default AppV3;
