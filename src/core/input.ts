const SWALLOW = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Tab',
]);

/**
 * KeyboardEvent.code를 1순위로 쓰되(물리 키 위치 기준), code가 비어 있는
 * 합성 이벤트나 일부 IME 상황에 대비해 key에서도 코드를 유추한다.
 * 자동화 도구가 보내는 키 이벤트는 code를 안 채우는 경우가 흔하다.
 */
function codesOf(e: KeyboardEvent): string[] {
  const out: string[] = [];
  if (e.code) out.push(e.code);
  const k = e.key;
  if (k && k.length === 1) {
    const c = k.toUpperCase();
    if (c >= 'A' && c <= 'Z') push(out, `Key${c}`);
    else if (c >= '0' && c <= '9') push(out, `Digit${c}`);
    else if (k === ' ') push(out, 'Space');
  } else if (k === 'Shift') {
    push(out, 'ShiftLeft');
  } else if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') {
    push(out, k);
  }
  return out;
}

function push(arr: string[], v: string): void {
  if (!arr.includes(v)) arr.push(v);
}

export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();

  attach(target: Window = window): void {
    target.addEventListener('keydown', (e) => {
      const codes = codesOf(e);
      if (codes.some((c) => SWALLOW.has(c))) e.preventDefault();
      if (e.repeat) return;
      for (const c of codes) {
        this.down.add(c);
        this.pressed.add(c);
      }
    });
    target.addEventListener('keyup', (e) => {
      for (const c of codesOf(e)) this.down.delete(c);
    });
    target.addEventListener('blur', () => {
      this.down.clear();
    });
  }

  isDown(...codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  wasPressed(...codes: string[]): boolean {
    return codes.some((c) => this.pressed.has(c));
  }

  /** 렌더 직후 호출. justPressed는 프레임 단위로만 산다. */
  endFrame(): void {
    this.pressed.clear();
  }

  /** 화면 기준 이동 입력 (-1..1). */
  axisX(): number {
    return (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
  }

  axisY(): number {
    return (this.isDown('KeyS', 'ArrowDown') ? 1 : 0) - (this.isDown('KeyW', 'ArrowUp') ? 1 : 0);
  }
}
