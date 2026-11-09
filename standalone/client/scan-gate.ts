// A held barcode is one scan. A different barcode also requires an empty frame.
export class ScanGate {
  private last = "";
  private absentSince = 0;
  private busy = false;
  frame(code: string | null, now: number) {
    if (!code) {
      if (!this.absentSince) this.absentSince = now;
      return false;
    }
    const clear = this.absentSince > 0 && now - this.absentSince >= 800;
    this.absentSince = 0;
    if (this.busy || (this.last && !clear)) return false;
    this.last = code;
    this.busy = true;
    return true;
  }
  done() {
    this.busy = false;
  }
}
