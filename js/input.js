import { KEY_BINDINGS } from './config.js';

export class InputController {
  constructor({ onDrive, onCommand, onAnyManualInput } = {}) {
    this.onDrive = onDrive || (() => {});
    this.onCommand = onCommand || (() => {});
    this.onAnyManualInput = onAnyManualInput || (() => {});
    this.accel = false;
    this.brake = false;
    this.enabled = true;
    this.touchPointers = new Map();
    this.heldKeys = new Set();
    this.anyKey = false;
    this._bindKeyboard();
    this._bindTouch();
    this._bindLifecycle();
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (event) => {
      if (event.target instanceof HTMLInputElement) return;
      const code = event.code;
      if (!this.enabled && !['Escape', 'KeyP'].includes(code)) return;
      if (this.heldKeys.has(code) && !KEY_BINDINGS.jump.includes(code) && !KEY_BINDINGS.wing.includes(code)) {
        if (KEY_BINDINGS.accel.includes(code) || KEY_BINDINGS.brake.includes(code)) event.preventDefault();
        return;
      }
      const driveAction =
        KEY_BINDINGS.accel.includes(code) ? 'accel' :
        KEY_BINDINGS.brake.includes(code) ? 'brake' :
        KEY_BINDINGS.left.includes(code) ? 'left' :
        KEY_BINDINGS.right.includes(code) ? 'right' :
        KEY_BINDINGS.jump.includes(code) ? 'jump' :
        KEY_BINDINGS.wing.includes(code) ? 'wing' : null;
      if (driveAction) {
        event.preventDefault();
        this.heldKeys.add(code);
        if (driveAction === 'accel') {
          this.accel = true;
        } else if (driveAction === 'brake') {
          this.brake = true;
        } else if (!event.repeat) {
          this.onDrive(driveAction);
        }
        this.onAnyManualInput('key');
        return;
      }
      const command =
        KEY_BINDINGS.camera.includes(code) ? 'camera' :
        KEY_BINDINGS.mute.includes(code) ? 'mute' :
        KEY_BINDINGS.pause.includes(code) ? 'pause' :
        KEY_BINDINGS.help.includes(code) ? 'help' :
        KEY_BINDINGS.motion.includes(code) ? 'motion' : null;
      if (command) {
        event.preventDefault();
        if (!event.repeat) this.onCommand(command, event);
      }
    }, { passive: false });

    window.addEventListener('keyup', (event) => {
      this.heldKeys.delete(event.code);
      if (KEY_BINDINGS.accel.includes(event.code)) this.accel = false;
      if (KEY_BINDINGS.brake.includes(event.code)) this.brake = false;
    });

    window.addEventListener('blur', () => this.releaseAll());
  }

  _bindTouch() {
    const buttons = document.querySelectorAll('[data-touch]');
    for (const button of buttons) {
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!this.enabled) return;
        const action = button.dataset.touch;
        this.touchPointers.set(event.pointerId, { button, action });
        button.classList.add('pressed');
        button.setPointerCapture?.(event.pointerId);
        if (action === 'accel') this.accel = true;
        else if (action === 'brake') this.brake = true;
        else this.onDrive(action);
        this.onAnyManualInput('touch');
      });
      const release = (event) => {
        const data = this.touchPointers.get(event.pointerId);
        if (!data) return;
        this.touchPointers.delete(event.pointerId);
        data.button.classList.remove('pressed');
        if (data.action === 'accel') this.accel = false;
        if (data.action === 'brake') this.brake = false;
      };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    }
  }

  _bindLifecycle() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });
    window.addEventListener('contextmenu', (event) => {
      if (event.target instanceof HTMLElement && event.target.closest('.mobile-controls')) {
        event.preventDefault();
      }
    });
  }

  releaseAll() {
    this.accel = false;
    this.brake = false;
    this.heldKeys.clear();
    for (const [, data] of this.touchPointers) data.button.classList.remove('pressed');
    this.touchPointers.clear();
  }

  setEnabled(value) {
    this.enabled = value;
    if (!value) this.releaseAll();
  }

  getState() {
    return {
      accel: this.accel,
      brake: this.brake,
    };
  }
}
