import tkinter as tk
import math
import mido
import threading
from evdev import InputDevice, categorize, ecodes, list_devices
import os
import time

# --- Pre-flight Check for Permissions ---
if os.geteuid() != 0:
    print("Warning: This script may need root privileges to access keyboard devices.")
    print("Try running with 'sudo python your_script.py' if it fails to find keyboards.")
    print("-" * 20)
    time.sleep(2)

# --- Configuration ---
mido.set_backend('mido.backends.rtmidi')

# Hexagon properties
HEX_SIZE = 50

# Dynamic sizing
HEADER_FONT_SIZE = int(HEX_SIZE / 2.5)
INFO_FONT_SIZE = int(HEX_SIZE / 3)
KEY_CHAR_FONT_SIZE = int(HEX_SIZE / 4)
NOTE_NAME_FONT_SIZE = int(HEX_SIZE / 3)
DROPDOWN_FONT_SIZE = int(HEX_SIZE / 5)

# --- MIDI Setup ---
try:
    midi_out = mido.open_output()
    print(f"Using MIDI port: {midi_out.name}")
except (IOError, mido.NoPortsError):
    print("\n--- MIDI ERROR: Could not find a MIDI output port. ---\n")
    midi_out = None

# --- Key Mappings ---
KEY_CHAR_MAPPING = {
    '1': (0, 0), '2': (1, 0), '3': (2, 0), '4': (3, 0), '5': (4, 0), '6': (5, 0), '7': (6, 0), '8': (7, 0), '9': (8, 0), '0': (9, 0),
    'q': (0, 1), 'w': (1, 1), 'e': (2, 1), 'r': (3, 1), 't': (4, 1), 'y': (5, 1), 'u': (6, 1), 'i': (7, 1), 'o': (8, 1), 'p': (9, 1),
    'a': (0, 2), 's': (1, 2), 'd': (2, 2), 'f': (3, 2), 'g': (4, 2), 'h': (5, 2), 'j': (6, 2), 'k': (7, 2), 'l': (8, 2), ';': (9, 2),
    'z': (0, 3), 'x': (1, 3), 'c': (2, 3), 'v': (3, 3), 'b': (4, 3), 'n': (5, 3), 'm': (6, 3), ',': (7, 3), '.': (8, 3), '/': (9, 3),
}

KEYCODE_TO_CHAR = {
    ecodes.KEY_1: '1', ecodes.KEY_2: '2', ecodes.KEY_3: '3', ecodes.KEY_4: '4', ecodes.KEY_5: '5',
    ecodes.KEY_6: '6', ecodes.KEY_7: '7', ecodes.KEY_8: '8', ecodes.KEY_9: '9', ecodes.KEY_0: '0',
    ecodes.KEY_Q: 'q', ecodes.KEY_W: 'w', ecodes.KEY_E: 'e', ecodes.KEY_R: 'r', ecodes.KEY_T: 't',
    ecodes.KEY_Y: 'y', ecodes.KEY_U: 'u', ecodes.KEY_I: 'i', ecodes.KEY_O: 'o', ecodes.KEY_P: 'p',
    ecodes.KEY_A: 'a', ecodes.KEY_S: 's', ecodes.KEY_D: 'd', ecodes.KEY_F: 'f', ecodes.KEY_G: 'g',
    ecodes.KEY_H: 'h', ecodes.KEY_J: 'j', ecodes.KEY_K: 'k', ecodes.KEY_L: 'l', ecodes.KEY_SEMICOLON: ';',
    ecodes.KEY_Z: 'z', ecodes.KEY_X: 'x', ecodes.KEY_C: 'c', ecodes.KEY_V: 'v', ecodes.KEY_B: 'b',
    ecodes.KEY_N: 'n', ecodes.KEY_M: 'm', ecodes.KEY_COMMA: ',', ecodes.KEY_DOT: '.', ecodes.KEY_SLASH: '/',
}

LAYOUTS = {
    "Wicki-Hayden":   {"V": 12, "H": 2, "BASE_NOTE": 40},
    "Harmonic Table": {"V": 7,  "H": 1, "BASE_NOTE": 60},
    "Gerhard":        {"V": 1,  "H": 7, "BASE_NOTE": 60},
    "Park":           {"V": 1,  "H": 5, "BASE_NOTE": 60},
    "Maupin":         {"V": 1,  "H": 3, "BASE_NOTE": 60},
    "Guitar (E-A)":   {"V": 5,  "H": 1, "BASE_NOTE": 64},
}

# --- Dynamic Window and Hexagon Dimensions ---
num_cols = max(col for col, row in KEY_CHAR_MAPPING.values()) + 1
num_rows = max(row for col, row in KEY_CHAR_MAPPING.values()) + 1
HEX_WIDTH = HEX_SIZE * 2
HEX_HEIGHT = math.sqrt(3) * HEX_SIZE
SINGLE_WIDTH = int((num_cols * 0.75 + 1.75) * HEX_WIDTH)
SINGLE_HEIGHT = int((num_rows + 2.5) * HEX_HEIGHT + (HEADER_FONT_SIZE + INFO_FONT_SIZE) * 2)

# --- Global Colors ---
COLOR_BG = "#2E2E2E"
COLOR_HEX = "#505050"
COLOR_HEX_SHADOW = "#1E1E1E"
COLOR_HEX_ACTIVE = "#007BFF"
COLOR_BORDER = "#1E1E1E"
COLOR_TEXT = "#FFFFFF"
COLOR_INFO_TEXT = "#BBBBBB"
COLOR_NOTE_TEXT = "#D3D3D3"

# --- Helper Functions ---
NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

def get_midi_note_name(note_number):
    if not (0 <= note_number <= 127): return ""
    octave = note_number // 12 - 1
    return f"{NOTE_NAMES[note_number % 12]}{octave}"

def get_midi_note(col, row, layout, base_note):
    row = 4 - row
    if row <= 2: col += 1
    H, V = layout["H"], layout["V"]
    if (H % 2) != (V % 2): return 60
    A = (H + V) // 2
    horizontal_offset = col * H
    vertical_offset = (row // 2) * V + (row % 2) * A
    return base_note + horizontal_offset + vertical_offset

# --- Single Keyboard Instance Class ---
class HexKeyboardInstance:
    def __init__(self, root, canvas, x_offset, y_offset, name, base_note):
        self.root = root
        self.canvas = canvas
        self.x_offset = x_offset
        self.y_offset = y_offset
        self.name = name
        self.base_note = base_note
        self.hexagons, self.note_texts, self.active_notes, self.scheduled_off_jobs = {}, {}, {}, {}
        self.current_layout_name = tk.StringVar(value=list(LAYOUTS.keys())[0])
        self.current_layout = LAYOUTS[self.current_layout_name.get()]
        self.draw_header()
        self.draw_grid()

    def draw_hexagon(self, x, y, key_char):
        shadow_offset = HEX_SIZE * 0.04
        points, shadow_points = [], []
        for i in range(6):
            angle_rad = math.pi / 180 * (60 * i + 30)
            px, py = x + HEX_SIZE * math.cos(angle_rad), y + HEX_SIZE * math.sin(angle_rad)
            points.append((px, py))
            shadow_points.append((px + shadow_offset, py + shadow_offset))
        self.canvas.create_polygon(shadow_points, fill=COLOR_HEX_SHADOW, outline=COLOR_BORDER, width=2)
        hex_id = self.canvas.create_polygon(points, fill=COLOR_HEX, outline=COLOR_BORDER, width=2)
        self.hexagons[key_char] = hex_id
        self.canvas.create_text(x, y - (HEX_HEIGHT * 0.15), text=key_char.upper(), fill=COLOR_TEXT, font=("Helvetica", KEY_CHAR_FONT_SIZE, "bold"))
        note_text_id = self.canvas.create_text(x, y + (HEX_HEIGHT * 0.2), text="", fill=COLOR_NOTE_TEXT, font=("Helvetica", NOTE_NAME_FONT_SIZE))
        self.note_texts[key_char] = note_text_id

    def draw_grid(self):
        start_x = self.x_offset + HEX_WIDTH * 0.75
        start_y = self.y_offset + HEX_HEIGHT + (HEADER_FONT_SIZE + INFO_FONT_SIZE) * 1.5
        for key, (col, row) in KEY_CHAR_MAPPING.items():
            x = start_x + col * HEX_WIDTH * 0.75 + row * HEX_WIDTH * 0.75 / 2
            y = start_y + row * HEX_HEIGHT
            self.draw_hexagon(x, y, key)
        self.update_note_names()

    def update_note_names(self, _=None):
        self.current_layout = LAYOUTS[self.current_layout_name.get()]
        for key, (col, row) in KEY_CHAR_MAPPING.items():
            midi_note = get_midi_note(col, row, self.current_layout, self.base_note)
            self.canvas.itemconfig(self.note_texts[key], text=get_midi_note_name(midi_note))

    def draw_header(self):
        center_x = self.x_offset + SINGLE_WIDTH / 2
        header_y = self.y_offset + HEADER_FONT_SIZE * 1.2
        dropdown_y = header_y + HEADER_FONT_SIZE + INFO_FONT_SIZE * 1.5
        self.canvas.create_text(center_x, header_y, text=self.name, fill=COLOR_TEXT, font=("Helvetica", HEADER_FONT_SIZE, "bold"))
        layout_menu = tk.OptionMenu(self.root, self.current_layout_name, *LAYOUTS.keys(), command=self.update_note_names)
        layout_menu.config(font=("Helvetica", DROPDOWN_FONT_SIZE), bg=COLOR_BG, fg=COLOR_TEXT, activebackground=COLOR_HEX_ACTIVE, highlightthickness=0)
        layout_menu["menu"].config(font=("Helvetica", DROPDOWN_FONT_SIZE), bg=COLOR_BG, fg=COLOR_TEXT)
        self.canvas.create_window(center_x, dropdown_y, window=layout_menu)

    def on_key_press(self, key_char):
        if key_char in self.scheduled_off_jobs:
            self.root.after_cancel(self.scheduled_off_jobs.pop(key_char))
        if key_char in KEY_CHAR_MAPPING and key_char not in self.active_notes:
            col, row = KEY_CHAR_MAPPING[key_char]
            midi_note = get_midi_note(col, row, self.current_layout, self.base_note)
            if 0 <= midi_note <= 127:
                self.active_notes[key_char] = midi_note
                if midi_out: midi_out.send(mido.Message('note_on', note=midi_note, velocity=100))
                self.canvas.itemconfig(self.hexagons[key_char], fill=COLOR_HEX_ACTIVE)

    def on_key_release(self, key_char):
        if key_char in self.active_notes:
            job_id = self.root.after(5, lambda k=key_char: self.turn_note_off(k))
            self.scheduled_off_jobs[key_char] = job_id

    def turn_note_off(self, key_char):
        if key_char in self.active_notes:
            midi_note = self.active_notes.pop(key_char)
            if midi_out and 0 <= midi_note <= 127:
                midi_out.send(mido.Message('note_off', note=midi_note, velocity=0))
            self.canvas.itemconfig(self.hexagons[key_char], fill=COLOR_HEX)
        if key_char in self.scheduled_off_jobs:
            del self.scheduled_off_jobs[key_char]

# --- Main Application Controller ---
class DualKeyboardApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Dual Hexagonal Isomorphic Keyboards")
        self.canvas_width = SINGLE_WIDTH * 2 + 50
        self.canvas_height = SINGLE_HEIGHT + 50
        self.canvas = tk.Canvas(root, width=self.canvas_width, height=self.canvas_height, bg=COLOR_BG)
        self.canvas.pack()
        self.keyboard1 = None
        self.keyboard2 = None
        self.threads = []
        self.running = True
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)

    def start_device_selection(self):
        """Finds devices and prompts user for selection in the terminal."""
        try:
            devices = [InputDevice(path) for path in list_devices()]
        except PermissionError:
            print("\nCRITICAL ERROR: Permission denied to read input devices.")
            print("Please run this script with 'sudo'.")
            self.root.destroy()
            return

        # --- THIS IS THE CRITICAL FIX ---
        # A much smarter filter to find real, alphanumeric keyboards.
        keyboards = []
        for dev in devices:
            caps = dev.capabilities()
            if ecodes.EV_KEY in caps:
                # Check for a few common letter keys to ensure it's a full keyboard
                key_list = caps[ecodes.EV_KEY]
                if ecodes.KEY_A in key_list and ecodes.KEY_Q in key_list and ecodes.KEY_Z in key_list:
                    keyboards.append(dev)
        # --- END OF FIX ---

        if len(keyboards) < 2:
            print(f"Error: Found {len(keyboards)} full keyboard(s), but 2 are required.")
            print("Please ensure both keyboards are connected.")
            if len(keyboards) > 0:
                print("Detected keyboard(s):")
                for kbd in keyboards:
                    print(f"  - {kbd.name} ({kbd.path})")
            self.root.destroy()
            return

        dev1_path = self.prompt_for_device(keyboards, "first")
        if not dev1_path: self.root.destroy(); return
        
        remaining_keyboards = [dev for dev in keyboards if dev.path != dev1_path]
        
        dev2_path = self.prompt_for_device(remaining_keyboards, "second")
        if not dev2_path: self.root.destroy(); return

        self.keyboard1 = HexKeyboardInstance(self.root, self.canvas, 25, 0, "Keyboard 1", base_note=36)
        self.keyboard2 = HexKeyboardInstance(self.root, self.canvas, SINGLE_WIDTH + 25, 0, "Keyboard 2", base_note=60)

        self.start_listener_thread(dev1_path, self.keyboard1)
        self.start_listener_thread(dev2_path, self.keyboard2)

    def prompt_for_device(self, devices, name):
        """Helper to show a selection prompt in the console."""
        print(f"\n--- Please select the {name} keyboard ---")
        for i, dev in enumerate(devices):
            print(f"  {i}: {dev.path} - {dev.name}")
        
        while True:
            try:
                choice = 0
                # choice = int(input(f"Enter the number for the {name} keyboard: "))
                if 0 <= choice < len(devices):
                    return devices[choice].path
                else:
                    print("Invalid number. Please try again.")
            except (ValueError, EOFError):
                print("Invalid input. Please enter a number.")

    def start_listener_thread(self, device_path, keyboard_instance):
        """Starts a dedicated thread to listen to one specific device."""
        thread = threading.Thread(target=self.listen_to_device, args=(device_path, keyboard_instance), daemon=True)
        self.threads.append(thread)
        thread.start()

    def listen_to_device(self, device_path, keyboard_instance):
        """The core event loop for a single device."""
        try:
            device = InputDevice(device_path)
            device.grab()
            print(f"Success: Listening on {device.name} ({device.path})")
            while self.running:
                for event in device.read_loop():
                    if not self.running: break
                    if event.type == ecodes.EV_KEY:
                        key_event = categorize(event)
                        key_char = KEYCODE_TO_CHAR.get(key_event.scancode)
                        if key_char:
                            if key_event.keystate == key_event.key_down:
                                self.root.after(0, keyboard_instance.on_key_press, key_char)
                            elif key_event.keystate == key_event.key_up:
                                self.root.after(0, keyboard_instance.on_key_release, key_char)
        except Exception as e:
            print(f"Error with device {device_path}: {e}")
        finally:
            if 'device' in locals():
                device.ungrab()

    def on_closing(self):
        """Handle window close event to gracefully shut down threads."""
        print("Closing application...")
        self.running = False
        if midi_out:
            midi_out.close()
        # A small delay to allow listener threads to see self.running = False
        time.sleep(0.1)
        self.root.destroy()

# --- Run the Application ---
if __name__ == "__main__":
    root = tk.Tk()
    app = DualKeyboardApp(root)
    root.after(100, app.start_device_selection)
    root.mainloop()