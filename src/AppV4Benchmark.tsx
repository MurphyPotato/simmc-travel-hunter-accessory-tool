import { ChangeEvent, useMemo, useState } from "react";
import { recognizeAccessoryImageV4 } from "./ocrV4";
import {
  evaluateV4BenchmarkCase,
  summarizeV4Benchmark,
  V4BenchmarkMetrics,
  V4BenchmarkOutcome,
} from "./ocrV4Benchmark";
import { V4_BENCHMARK_CASES } from "./ocrV4BenchmarkData";

interface BrowserBenchmarkReport {
  generatedAt: string;
  metrics: V4BenchmarkMetrics;
  outcomes: V4BenchmarkOutcome[];
  missingFiles: string[];
}

interface BrowserSyntheticReport {
  generatedAt: string;
  metrics: V4BenchmarkMetrics;
  outcomes: V4BenchmarkOutcome[];
}

function AppV4Benchmark() {
  const [files, setFiles] = useState<Map<string, File>>(new Map());
  const [outcomes, setOutcomes] = useState<V4BenchmarkOutcome[]>([]);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [status, setStatus] = useState("选择素材库图片后运行。图片不会写入页面或发行包。");
  const [syntheticOutcomes, setSyntheticOutcomes] = useState<V4BenchmarkOutcome[]>([]);
  const [syntheticLabels, setSyntheticLabels] = useState<Record<string, string>>({});
  const [syntheticRunning, setSyntheticRunning] = useState(false);
  const [syntheticCompleted, setSyntheticCompleted] = useState(0);
  const [syntheticStatus, setSyntheticStatus] = useState("尚未运行。字体和合成图只从开发缓存读取。");
  const matchedCases = useMemo(
    () => V4_BENCHMARK_CASES.filter((item) => files.has(item.fileName)),
    [files],
  );
  const missingFiles = useMemo(
    () => V4_BENCHMARK_CASES.filter((item) => !files.has(item.fileName)).map((item) => item.fileName),
    [files],
  );
  const metrics = useMemo(() => summarizeV4Benchmark(outcomes), [outcomes]);
  const syntheticMetrics = useMemo(() => summarizeV4Benchmark(syntheticOutcomes), [syntheticOutcomes]);

  function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const next = new Map(files);
    Array.from(event.target.files ?? []).forEach((file) => next.set(file.name, file));
    setFiles(next);
    setStatus(`已匹配 ${V4_BENCHMARK_CASES.filter((item) => next.has(item.fileName)).length}/${V4_BENCHMARK_CASES.length} 个基准文件。`);
    event.target.value = "";
  }

  async function runBenchmark() {
    if (matchedCases.length === 0 || running) return;
    setRunning(true);
    setCompleted(0);
    setOutcomes([]);
    setStatus("双 Worker 队列正在识别，结果会逐张汇总。");
    const completedOutcomes: V4BenchmarkOutcome[] = [];
    await Promise.all(matchedCases.map(async (benchmark) => {
      const file = files.get(benchmark.fileName)!;
      try {
        const parsed = await recognizeAccessoryImageV4(file);
        const outcome = evaluateV4BenchmarkCase(benchmark, parsed);
        completedOutcomes.push(outcome);
        setOutcomes([...completedOutcomes].sort((left, right) => left.fileName.localeCompare(right.fileName)));
      } catch (error) {
        setStatus(`${benchmark.fileName} 识别失败：${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setCompleted((value) => value + 1);
      }
    }));
    const sorted = [...completedOutcomes].sort((left, right) => left.fileName.localeCompare(right.fileName));
    const finalMetrics = summarizeV4Benchmark(sorted);
    const report: BrowserBenchmarkReport = {
      generatedAt: new Date().toISOString(),
      metrics: finalMetrics,
      outcomes: sorted,
      missingFiles,
    };
    window.__V4_BENCHMARK_RESULTS__ = report;
    setOutcomes(sorted);
    setRunning(false);
    setStatus(`已完成 ${sorted.length} 张，结果已写入 window.__V4_BENCHMARK_RESULTS__。`);
  }

  async function runSyntheticBenchmark() {
    if (syntheticRunning) return;
    setSyntheticRunning(true);
    setSyntheticCompleted(0);
    setSyntheticOutcomes([]);
    setSyntheticStatus("正在从开发缓存加载 1.21.8 字模和 ModernUI 字体...");
    try {
      const { createV4SyntheticBenchmarkCases } = await import("./ocrV4SyntheticBenchmark");
      const syntheticCases = await createV4SyntheticBenchmarkCases();
      setSyntheticLabels(Object.fromEntries(syntheticCases.map((item) => [item.benchmark.fileName, item.label])));
      setSyntheticStatus(`双 Worker 队列正在识别 ${syntheticCases.length} 个合成变体...`);
      const completedOutcomes: V4BenchmarkOutcome[] = [];
      await Promise.all(syntheticCases.map(async (item) => {
        const parsed = await recognizeAccessoryImageV4(item.file);
        completedOutcomes.push(evaluateV4BenchmarkCase(item.benchmark, parsed));
        setSyntheticOutcomes([...completedOutcomes].sort((left, right) => left.fileName.localeCompare(right.fileName)));
        setSyntheticCompleted((value) => value + 1);
      }));
      const sorted = [...completedOutcomes].sort((left, right) => left.fileName.localeCompare(right.fileName));
      const finalMetrics = summarizeV4Benchmark(sorted);
      window.__V4_SYNTHETIC_RESULTS__ = {
        generatedAt: new Date().toISOString(),
        metrics: finalMetrics,
        outcomes: sorted,
      };
      setSyntheticOutcomes(sorted);
      setSyntheticStatus(`已完成 ${sorted.length} 个变体，结果已写入 window.__V4_SYNTHETIC_RESULTS__。`);
    } catch (error) {
      setSyntheticStatus(`合成校准失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSyntheticRunning(false);
    }
  }

  function downloadReport() {
    const report: BrowserBenchmarkReport = {
      generatedAt: new Date().toISOString(),
      metrics,
      outcomes,
      missingFiles,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "v4-ocr-benchmark-report.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="benchmarkPage">
      <header className="benchmarkHeader">
        <div>
          <span>开发专用 / 不进入发行包</span>
          <h1>V4 OCR 真实截图基准</h1>
          <p>按独立文件真值统计正确、待复核和静默错误。39 张原版截图，5 张 ModernUI tooltip，另含 3 张负样本。</p>
        </div>
        <a href="/">返回工具</a>
      </header>

      <section className="benchmarkControls">
        <label className="primaryButton">
          选择基准图片
          <input type="file" accept="image/*" multiple onChange={onFiles} hidden />
        </label>
        <button type="button" onClick={runBenchmark} disabled={running || matchedCases.length === 0}>
          {running ? `识别中 ${completed}/${matchedCases.length}` : `运行基准 (${matchedCases.length})`}
        </button>
        <button type="button" onClick={downloadReport} disabled={outcomes.length === 0}>导出 JSON</button>
        <strong data-testid="benchmark-status">{status}</strong>
      </section>

      <section className="benchmarkMetrics" data-testid="benchmark-metrics">
        <Metric label="字体分流正确率" value={percent(metrics.profileAccuracy)} />
        <Metric label="标题字段准确率" value={percent(metrics.titleAccuracy)} />
        <Metric label="已知词条准确率" value={percent(metrics.knownStatAccuracy)} />
        <Metric label="数值准确率" value={percent(metrics.valueAccuracy)} />
        <Metric label="自动接受率" value={percent(metrics.autoAcceptRate)} />
        <Metric label="标红率" value={percent(metrics.reviewRate)} />
        <Metric label="静默错误率" value={percent(metrics.silentErrorRate)} danger={metrics.silentErrors > 0} />
        <Metric label="负样本误接受" value={String(metrics.falsePositiveCount)} danger={metrics.falsePositiveCount > 0} />
      </section>

      <section className="benchmarkTableWrap">
        <table className="benchmarkTable">
          <thead><tr><th>文件</th><th>字体</th><th>拆分</th><th>正确</th><th>标红</th><th>静默错误</th><th>结果</th></tr></thead>
          <tbody>
            {outcomes.map((outcome) => {
              const correct = outcome.fields.filter((field) => field.correct).length;
              const reviewed = outcome.fields.filter((field) => field.state === "needs-review").length;
              const silent = outcome.fields.filter((field) => field.silentError).length;
              const failed = silent > 0 || outcome.falsePositive;
              return (
                <tr key={outcome.fileName} className={failed ? "benchmarkFailed" : ""}>
                  <td>{outcome.fileName}</td>
                  <td>{outcome.parsed.profile}</td>
                  <td>{outcome.split}</td>
                  <td>{correct}/{outcome.fields.length}</td>
                  <td>{reviewed}</td>
                  <td>{silent}</td>
                  <td>{outcome.expectedAccessory ? (failed ? "需修复" : "通过") : (outcome.falsePositive ? "负样本误接受" : "负样本通过")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="benchmarkSynthetic" data-testid="synthetic-benchmark">
        <div>
          <span>开发专用 / 不进入发行包</span>
          <h2>双字体合成校准</h2>
          <p>覆盖原版 GUI 整数缩放、文字配色、裁剪偏移、思源黑体缩放和轻度 JPEG 压缩。合成结果只用于发现阈值回归，不替代真实截图保留集。</p>
        </div>
        <button type="button" onClick={runSyntheticBenchmark} disabled={syntheticRunning}>
          {syntheticRunning ? `校准中 ${syntheticCompleted}/8` : "运行合成校准"}
        </button>
        <strong>{syntheticStatus}</strong>
      </section>

      {syntheticOutcomes.length > 0 && (
        <>
          <section className="benchmarkMetrics" data-testid="synthetic-benchmark-metrics">
            <Metric label="字体分流正确率" value={percent(syntheticMetrics.profileAccuracy)} />
            <Metric label="标题字段准确率" value={percent(syntheticMetrics.titleAccuracy)} />
            <Metric label="已知词条准确率" value={percent(syntheticMetrics.knownStatAccuracy)} />
            <Metric label="数值准确率" value={percent(syntheticMetrics.valueAccuracy)} />
            <Metric label="自动接受率" value={percent(syntheticMetrics.autoAcceptRate)} />
            <Metric label="标红率" value={percent(syntheticMetrics.reviewRate)} />
            <Metric label="静默错误率" value={percent(syntheticMetrics.silentErrorRate)} danger={syntheticMetrics.silentErrors > 0} />
            <Metric label="静默错误数" value={String(syntheticMetrics.silentErrors)} danger={syntheticMetrics.silentErrors > 0} />
          </section>
          <section className="benchmarkTableWrap">
            <table className="benchmarkTable">
              <thead><tr><th>合成变体</th><th>识别字体</th><th>正确</th><th>标红</th><th>静默错误</th><th>结果</th></tr></thead>
              <tbody>
                {syntheticOutcomes.map((outcome) => {
                  const correct = outcome.fields.filter((field) => field.correct).length;
                  const reviewed = outcome.fields.filter((field) => field.state === "needs-review").length;
                  const silent = outcome.fields.filter((field) => field.silentError).length;
                  const failed = silent > 0 || !outcome.profileCorrect;
                  return (
                    <tr key={outcome.fileName} className={failed ? "benchmarkFailed" : ""}>
                      <td>{syntheticLabels[outcome.fileName] ?? outcome.fileName}</td>
                      <td>{outcome.parsed.profile}</td>
                      <td>{correct}/{outcome.fields.length}</td>
                      <td>{reviewed}</td>
                      <td>{silent}</td>
                      <td>{failed ? "需校准" : "通过"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}

function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className={danger ? "benchmarkMetric danger" : "benchmarkMetric"}><span>{label}</span><strong>{value}</strong></div>;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

declare global {
  interface Window {
    __V4_BENCHMARK_RESULTS__?: BrowserBenchmarkReport;
    __V4_SYNTHETIC_RESULTS__?: BrowserSyntheticReport;
  }
}

export default AppV4Benchmark;
