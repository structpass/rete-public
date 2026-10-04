'use client';

import { useEffect, useRef } from 'react';

/**
 * ログイン背景のネットワークキャンバス（rete-login-0006 / 配色改定 rete-login-0008）。
 * Rete の意義（ステークホルダーを結ぶ網・動かし続け回転させる仕組み）を
 * 「点と線のネットワークがゆるやかに回転・循環し続ける」動きで表現する。
 * 着色は StructPass ロゴのテーマカラー（ダークネイビー/アンバー）の 2 系統。
 * 構図はランダム分散＋全体回転（列島形状・都市配置は開発統括判断で撤回済み・再導入しない）。
 * prefers-reduced-motion でも止めない（回転が遅く酔わないため・rete-login-0008 方針）。
 */

const NAVY = { r: 27, g: 42, b: 74 }; // ロゴのダークネイビー #1B2A4A
const AMBER = { r: 245, g: 166, b: 35 }; // ロゴのアンバー #F5A623
/** 全体が 1 周する時間（秒）。75s は速すぎると開発統括判断（2026-07-18）で減速。 */
const ROTATION_PERIOD_S = 180;
/** この距離（px）より近いノード同士を線で結ぶ。 */
const LINK_DISTANCE = 150;

type NetworkNode = {
  /** 画面中心からの基準角（rad）。全体回転が加算される */
  angle: number;
  /** 画面中心からの基準距離（短辺比 0-1） */
  radius: number;
  /** 半径方向の揺らぎの位相・速さ・振幅（循環しつつ硬直しない見た目を作る） */
  wobblePhase: number;
  wobbleSpeed: number;
  wobbleAmp: number;
  size: number;
  color: typeof NAVY;
};

function createNodes(count: number): NetworkNode[] {
  const nodes: NetworkNode[] = [];
  for (let i = 0; i < count; i++) {
    nodes.push({
      angle: Math.random() * Math.PI * 2,
      // 中心（カード位置）を過密にせず、画面全体へ帯状に散らす
      radius: 0.18 + Math.random() * 0.72,
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.1 + Math.random() * 0.25,
      wobbleAmp: 0.02 + Math.random() * 0.05,
      size: 1.6 + Math.random() * 2.2,
      color: Math.random() < 0.62 ? NAVY : AMBER,
    });
  }
  return nodes;
}

function draw(
  ctx: CanvasRenderingContext2D,
  nodes: NetworkNode[],
  w: number,
  h: number,
  timeS: number,
) {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  // 半径の基準はビューポート対角の半分（四隅までネットワークを届かせる）
  const base = Math.hypot(w, h) / 2;
  const globalAngle = (timeS / ROTATION_PERIOD_S) * Math.PI * 2;

  const pts: { x: number; y: number; node: NetworkNode }[] = nodes.map((n) => {
    const r = (n.radius + Math.sin(timeS * n.wobbleSpeed + n.wobblePhase) * n.wobbleAmp) * base;
    const a = n.angle + globalAngle;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, node: n };
  });

  // 線: 近接ペアを結ぶ。近いほど濃く（最大でも淡く保ちフォームを邪魔しない）
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[i].x - pts[j].x;
      const dy = pts[i].y - pts[j].y;
      const dist = Math.hypot(dx, dy);
      if (dist >= LINK_DISTANCE) continue;
      const t = 1 - dist / LINK_DISTANCE;
      const c1 = pts[i].node.color;
      const c2 = pts[j].node.color;
      const r = Math.round((c1.r + c2.r) / 2);
      const g = Math.round((c1.g + c2.g) / 2);
      const b = Math.round((c1.b + c2.b) / 2);
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${(0.34 * t).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[j].x, pts[j].y);
      ctx.stroke();
    }
  }

  // 点: 線より一段はっきり出す（明るいアンバーはやや濃く出して沈みを防ぐ）
  for (const p of pts) {
    const { r, g, b } = p.node.color;
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.node.color === AMBER ? 0.6 : 0.5})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.node.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function LoginNetworkCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // ノード数は面積比例（1400x900 で約 70 個）。上限で低スペック時の過剰描画を防ぐ
    const area = window.innerWidth * window.innerHeight;
    const nodes = createNodes(Math.min(90, Math.max(40, Math.round(area / 18000))));

    let rafId = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // prefers-reduced-motion でも止めない（回転が遅く酔わないため・rete-login-0008 方針）。
    // OS 側でアニメーション抑制を有効にした環境で「背景が静止して見える」退行を防ぐ。
    const startMs = performance.now();
    const tick = (nowMs: number) => {
      draw(ctx, nodes, window.innerWidth, window.innerHeight, (nowMs - startMs) / 1000);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
    />
  );
}
