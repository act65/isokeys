import tkinter as tk
import math
import mido

# --- Configuration ---
mido.set_backend('mido.backends.rtmidi')

# Hexagon properties
HEX_SIZE = 75  # Change this value to scale the entire UI

# Dynamic sizing based on HEX_SIZE
# Font sizes
HEADER_FONT_SIZE = int(HEX_SIZE / 2.5)
INFO_FONT_SIZE = int(HEX_SIZE / 4)
KEY_CHAR_FONT_SIZE = int(HEX_SIZE / 4)
NOTE_NAME_FONT_SIZE = int(HEX_SIZE / 4.5)
DROPDOWN_FONT_SIZE = int(HEX_SIZE / 5)

# --- MIDI Setup ---
try:
    # Open the first available MIDI output port
    midi_out = mido.open_output()
    print(f"Using MIDI port: {midi_out.name}")
except (IOError, mido.NoPortsError) as e:
    print("\n--- MIDI ERROR ---")
    print("Could not find a MIDI output port.")
    print("Please make sure a software synthesizer (like qsynth, fluidsynth) is running.")
    print("Or that a physical MIDI device is connected.")
    print("------------------\n")
    midi_out = None

# --- Keyboard Layout and Note Mapping ---
KEY_MAPPING = {
    '1': (0, 0), '2': (1, 0), '3': (2, 0), '4': (3, 0), '5': (4, 0), '6': (5, 0), '7': (6, 0), '8': (7, 0), '9': (8, 0), '0': (9, 0),
    'q': (0, 1), 'w': (1, 1), 'e': (2, 1), 'r': (3, 1), 't': (4, 1), 'y': (5, 1), 'u': (6, 1), 'i': (7, 1), 'o': (8, 1), 'p': (9, 1),
    'a': (0, 2), 's': (1, 2), 'd': (2, 2), 'f': (3, 2), 'g': (4, 2), 'h': (5, 2), 'j': (6, 2), 'k': (7, 2), 'l': (8, 2), 'semicolon': (9, 2),
    'z': (0, 3), 'x': (1, 3), 'c': (2, 3), 'v': (3, 3), 'b': (4, 3), 'n': (5, 3), 'm': (6, 3), 'comma': (7, 3), 'period': (8, 3), 'slash': (9, 3),
}

# --- CORRECTED Isomorphic Layout Definitions ---
# V = Vertical interval (semitones between TWO keyboard rows)
# H = Horizontal interval (semitones between adjacent keys in a row)
# BASE_NOTE = The MIDI note for the key at the top-left (0,0), e.g., '1'
# NOTE: For a valid hexagonal tessellation, H and V must have the same parity (both even or both odd).
LAYOUTS = {
    "Wicki-Hayden":   {"V": 12, "H": 2, "BASE_NOTE": 40}, # Octave/Whole-Tone
    "Harmonic Table": {"V": 7,  "H": 1, "BASE_NOTE": 60}, # Perfect Fifth/Semitone
    "Gerhard":        {"V": 1,  "H": 7, "BASE_NOTE": 60}, # Semitone/Perfect Fifth
    "Park":           {"V": 1,  "H": 5, "BASE_NOTE": 60}, # Semitone/Perfect Fourth
    "Maupin":         {"V": 1,  "H": 3, "BASE_NOTE": 60}, # Semitone/Minor Third
    "Guitar (E-A)":   {"V": 5,  "H": 1, "BASE_NOTE": 64}, # Perfect Fourth/Semitone
}


# --- Dynamic Window and Hexagon Dimensions ---
num_cols = max(col for col, row in KEY_MAPPING.values()) + 1
num_rows = max(row for col, row in KEY_MAPPING.values()) + 1

HEX_WIDTH = HEX_SIZE * 2
HEX_HEIGHT = math.sqrt(3) * HEX_SIZE

# Calculate window dimensions based on grid size
WIDTH = int((num_cols * 0.75 + 1.75) * HEX_WIDTH)
HEIGHT = int((num_rows + 2.5) * HEX_HEIGHT + (HEADER_FONT_SIZE + INFO_FONT_SIZE) * 2)


# Colors
COLOR_BG = "#2E2E2E"      # Dark Gray
COLOR_HEX = "#505050"      # Medium Gray
COLOR_HEX_SHADOW = "#1E1E1E" # Darker Gray
COLOR_HEX_ACTIVE = "#007BFF" # Blue
COLOR_BORDER = "#1E1E1E"  # Darker Gray
COLOR_TEXT = "#FFFFFF"     # White
COLOR_INFO_TEXT = "#BBBBBB" # Light Gray
COLOR_NOTE_TEXT = "#D3D3D3" # Light Gray for note names


NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

def get_midi_note_name(note_number):
    """Converts a MIDI note number to its name (e.g., C4)."""
    if not (0 <= note_number <= 127):
        return ""
    octave = note_number // 12 - 1
    note_index = note_number % 12
    return f"{NOTE_NAMES[note_index]}{octave}"

def get_midi_note(col, row, layout):
    """
    Calculates the MIDI note for a given grid position and layout
    on a horizontally-tiled hex grid.
    """
    # hacks for computer keyboard
    row = 4-row  # hack to reverse the layout
    if row <=2:
        col += 1

    H = layout["H"]
    V = layout["V"]

    
    if (H % 2) != (V % 2):
        print(f"Warning: Layout with H={H}, V={V} has incompatible parity.")
        return 60

    A = (H + V) // 2
    
    horizontal_offset = col * H
    
    num_two_row_jumps = row // 2
    vertical_offset = num_two_row_jumps * V
    
    if row % 2 != 0:
        vertical_offset += A
            
    return layout["BASE_NOTE"] + horizontal_offset + vertical_offset

# --- Main Application Class ---
class HexKeyboardApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Hexagonal Isomorphic Keyboard")
        
        self.canvas = tk.Canvas(root, width=WIDTH, height=HEIGHT, bg=COLOR_BG)
        self.canvas.pack()
        
        self.hexagons = {}
        self.note_texts = {}
        self.active_notes = {} # Tracks currently playing notes
        self.scheduled_off_jobs = {} # Tracks scheduled note-off events

        self.current_layout_name = tk.StringVar(value=list(LAYOUTS.keys())[0])
        self.current_layout = LAYOUTS[self.current_layout_name.get()]

        self.draw_header()
        self.draw_grid()
        
        self.root.bind("<KeyPress>", self.on_key_press)
        self.root.bind("<KeyRelease>", self.on_key_release)

    def draw_hexagon(self, x, y, key_char):
        """Draws a single hexagon with a shadow on the canvas."""
        shadow_offset = HEX_SIZE * 0.04
        shadow_points = []
        points = []
        for i in range(6):
            angle_deg = 60 * i + 30
            angle_rad = math.pi / 180 * angle_deg

            px = x + HEX_SIZE * math.cos(angle_rad)
            py = y + HEX_SIZE * math.sin(angle_rad)

            points.append((px, py))
            shadow_points.append((px + shadow_offset, py + shadow_offset))

        self.canvas.create_polygon(shadow_points, fill=COLOR_HEX_SHADOW, outline=COLOR_BORDER, width=2)
        
        hex_id = self.canvas.create_polygon(points, fill=COLOR_HEX, outline=COLOR_BORDER, width=2)
        self.hexagons[key_char] = hex_id
        
        # Display character for punctuation keys
        display_char = key_char
        if key_char == 'semicolon': display_char = ';'
        elif key_char == 'comma': display_char = ','
        elif key_char == 'period': display_char = '.'
        elif key_char == 'slash': display_char = '/'

        self.canvas.create_text(x, y - (HEX_HEIGHT * 0.15), text=display_char.upper(), fill=COLOR_TEXT, font=("Helvetica", KEY_CHAR_FONT_SIZE, "bold"))
        
        note_text_id = self.canvas.create_text(x, y + (HEX_HEIGHT * 0.2), text="", fill=COLOR_NOTE_TEXT, font=("Helvetica", NOTE_NAME_FONT_SIZE))
        self.note_texts[key_char] = note_text_id


    def draw_grid(self):
        """Draws the entire grid of hexagons."""
        start_x = HEX_WIDTH * 0.75
        start_y = HEX_HEIGHT + (HEADER_FONT_SIZE + INFO_FONT_SIZE) * 1.5
        for key, (col, row) in KEY_MAPPING.items():
            x = start_x + col * HEX_WIDTH * 0.75
            y = start_y + row * HEX_HEIGHT
            # Offset every other row for the hexagonal look
            # if row % 2 != 0:
            #     x += HEX_WIDTH * 0.75 / 2

            # hack for computer keyboard
            x += row * HEX_WIDTH * 0.75 / 2

            self.draw_hexagon(x, y, key)
        self.update_note_names()

    def update_note_names(self):
        """Updates the note names on all hexagons based on the current layout."""
        self.current_layout = LAYOUTS[self.current_layout_name.get()]
        for key, (col, row) in KEY_MAPPING.items():
            midi_note = get_midi_note(col, row, self.current_layout)
            note_name = get_midi_note_name(midi_note)
            self.canvas.itemconfig(self.note_texts[key], text=note_name)


    def draw_header(self):
        """Draws the title, instructional text, and layout dropdown."""
        header_y = HEADER_FONT_SIZE * 1.2
        info_y = header_y + HEADER_FONT_SIZE
        dropdown_y = info_y + INFO_FONT_SIZE * 1.5
        
        self.canvas.create_text(WIDTH / 2, header_y, text="Hexagonal Isomorphic Keyboard", fill=COLOR_TEXT, font=("Helvetica", HEADER_FONT_SIZE, "bold"))
        self.canvas.create_text(WIDTH / 2, info_y, text="Use your computer keyboard to play notes.", fill=COLOR_INFO_TEXT, font=("Helvetica", INFO_FONT_SIZE))

        layout_menu = tk.OptionMenu(self.root, self.current_layout_name, *LAYOUTS.keys(), command=lambda _: self.update_note_names())
        layout_menu.config(font=("Helvetica", DROPDOWN_FONT_SIZE), bg=COLOR_BG, fg=COLOR_TEXT, activebackground=COLOR_HEX_ACTIVE, highlightthickness=0)
        layout_menu["menu"].config(font=("Helvetica", DROPDOWN_FONT_SIZE), bg=COLOR_BG, fg=COLOR_TEXT)
        self.canvas.create_window(WIDTH / 2, dropdown_y, window=layout_menu)


    def on_key_press(self, event):
        """Handles a key being pressed."""
        key = event.keysym.lower()

        if key in self.scheduled_off_jobs:
            self.root.after_cancel(self.scheduled_off_jobs.pop(key))
        
        if key in KEY_MAPPING and key not in self.active_notes:
            col, row = KEY_MAPPING[key]
            midi_note = get_midi_note(col, row, self.current_layout)
            
            if 0 <= midi_note <= 127:
                self.active_notes[key] = midi_note 
                if midi_out:
                    midi_out.send(mido.Message('note_on', note=midi_note, velocity=100))
                
                hex_id = self.hexagons[key]
                self.canvas.itemconfig(hex_id, fill=COLOR_HEX_ACTIVE)

    def on_key_release(self, event):
        """Handles a key being released by scheduling a note-off."""
        key = event.keysym.lower()
        
        if key in self.active_notes:
            job_id = self.root.after(3, lambda k=key: self.turn_note_off(k))
            self.scheduled_off_jobs[key] = job_id

    def turn_note_off(self, key):
        """The actual logic to turn a note off, called after a delay."""
        if key in self.active_notes:
            midi_note = self.active_notes.pop(key)
            if midi_out and 0 <= midi_note <= 127:
                midi_out.send(mido.Message('note_off', note=midi_note, velocity=0))
            
            hex_id = self.hexagons[key]
            self.canvas.itemconfig(hex_id, fill=COLOR_HEX)
        
        if key in self.scheduled_off_jobs:
            del self.scheduled_off_jobs[key]

# --- Run the Application ---
if __name__ == "__main__":
    root = tk.Tk()
    app = HexKeyboardApp(root)
    root.mainloop()
    
    # Clean up MIDI port on exit
    if midi_out:
        midi_out.close()