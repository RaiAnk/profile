"""
Mini-Max with Alpha-Beta Pruning Visualization
Shows game tree evaluation and pruning

Requirements:
    pip install matplotlib numpy
"""

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.animation import FuncAnimation, FFMpegWriter, PillowWriter
import numpy as np
import os

# Game tree structure
# Level 0: MAX, Level 1: MIN, Level 2: MAX (terminal)
game_tree = {
    'A': {'pos': (400, 400), 'type': 'MAX', 'children': ['B', 'C'], 'value': None},
    'B': {'pos': (200, 280), 'type': 'MIN', 'children': ['D', 'E'], 'value': None},
    'C': {'pos': (600, 280), 'type': 'MIN', 'children': ['F', 'G'], 'value': None},
    'D': {'pos': (100, 160), 'type': 'TERM', 'children': [], 'value': 3},
    'E': {'pos': (300, 160), 'type': 'TERM', 'children': [], 'value': 5},
    'F': {'pos': (500, 160), 'type': 'TERM', 'children': [], 'value': 2},
    'G': {'pos': (700, 160), 'type': 'TERM', 'children': [], 'value': 9},
}

# Mini-Max steps
minimax_steps = [
    {
        'title': 'Mini-Max Step 0: Setup',
        'current': None,
        'evaluated': [],
        'values': {},
        'desc': 'Game Tree with terminal values\nMAX wants to maximize\nMIN wants to minimize',
        'alpha': None, 'beta': None
    },
    {
        'title': 'Step 1: Evaluate D',
        'current': 'D',
        'evaluated': ['D'],
        'values': {'D': 3},
        'desc': 'Terminal node D = 3\nStart DFS from left',
        'alpha': None, 'beta': None
    },
    {
        'title': 'Step 2: Evaluate E',
        'current': 'E',
        'evaluated': ['D', 'E'],
        'values': {'D': 3, 'E': 5},
        'desc': 'Terminal node E = 5\nNow evaluate parent B (MIN)',
        'alpha': None, 'beta': None
    },
    {
        'title': 'Step 3: MIN at B',
        'current': 'B',
        'evaluated': ['D', 'E', 'B'],
        'values': {'D': 3, 'E': 5, 'B': 3},
        'desc': 'B = MIN(3, 5) = 3\nMIN picks smallest value',
        'alpha': None, 'beta': None
    },
    {
        'title': 'Step 4: Evaluate F',
        'current': 'F',
        'evaluated': ['D', 'E', 'B', 'F'],
        'values': {'D': 3, 'E': 5, 'B': 3, 'F': 2},
        'desc': 'Terminal node F = 2\nContinue with right subtree',
        'alpha': None, 'beta': None
    },
    {
        'title': 'Step 5: Evaluate G',
        'current': 'G',
        'evaluated': ['D', 'E', 'B', 'F', 'G'],
        'values': {'D': 3, 'E': 5, 'B': 3, 'F': 2, 'G': 9},
        'desc': 'Terminal node G = 9\nNow evaluate parent C (MIN)',
        'alpha': None, 'beta': None
    },
    {
        'title': 'Step 6: MIN at C',
        'current': 'C',
        'evaluated': ['D', 'E', 'B', 'F', 'G', 'C'],
        'values': {'D': 3, 'E': 5, 'B': 3, 'F': 2, 'G': 9, 'C': 2},
        'desc': 'C = MIN(2, 9) = 2\nMIN picks smallest value',
        'alpha': None, 'beta': None
    },
    {
        'title': 'Step 7: MAX at A (Root)',
        'current': 'A',
        'evaluated': ['D', 'E', 'B', 'F', 'G', 'C', 'A'],
        'values': {'D': 3, 'E': 5, 'B': 3, 'F': 2, 'G': 9, 'C': 2, 'A': 3},
        'desc': 'A = MAX(3, 2) = 3\nMAX picks B (value 3)\nOptimal move: A → B',
        'alpha': None, 'beta': None
    },
]

# Alpha-Beta steps
alphabeta_steps = [
    {
        'title': 'Alpha-Beta Step 0: Setup',
        'current': None,
        'evaluated': [],
        'values': {},
        'pruned': [],
        'desc': 'Alpha-Beta Pruning\nα = best for MAX (starts -∞)\nβ = best for MIN (starts +∞)',
        'alpha': '-∞', 'beta': '+∞'
    },
    {
        'title': 'Step 1: Evaluate D',
        'current': 'D',
        'evaluated': ['D'],
        'values': {'D': 3},
        'pruned': [],
        'desc': 'D = 3\nα = -∞, β = +∞',
        'alpha': '-∞', 'beta': '+∞'
    },
    {
        'title': 'Step 2: Evaluate E',
        'current': 'E',
        'evaluated': ['D', 'E'],
        'values': {'D': 3, 'E': 5},
        'pruned': [],
        'desc': 'E = 5\nB (MIN) = min(3,5) = 3',
        'alpha': '-∞', 'beta': '+∞'
    },
    {
        'title': 'Step 3: Update α at A',
        'current': 'B',
        'evaluated': ['D', 'E', 'B'],
        'values': {'D': 3, 'E': 5, 'B': 3},
        'pruned': [],
        'desc': 'B = 3\nα at A = MAX(-∞, 3) = 3\nMAX can guarantee at least 3',
        'alpha': '3', 'beta': '+∞'
    },
    {
        'title': 'Step 4: Evaluate F',
        'current': 'F',
        'evaluated': ['D', 'E', 'B', 'F'],
        'values': {'D': 3, 'E': 5, 'B': 3, 'F': 2},
        'pruned': [],
        'desc': 'F = 2\nAt C (MIN): β = min(+∞, 2) = 2\nC can force at most 2',
        'alpha': '3', 'beta': '2'
    },
    {
        'title': 'Step 5: PRUNE G!',
        'current': 'G',
        'evaluated': ['D', 'E', 'B', 'F'],
        'values': {'D': 3, 'E': 5, 'B': 3, 'F': 2, 'C': 2},
        'pruned': ['G'],
        'desc': 'β(2) ≤ α(3) → PRUNE!\nG is never evaluated!\nMAX won\'t choose C anyway',
        'alpha': '3', 'beta': '2'
    },
    {
        'title': 'Step 6: Final Result',
        'current': 'A',
        'evaluated': ['D', 'E', 'B', 'F', 'C', 'A'],
        'values': {'D': 3, 'E': 5, 'B': 3, 'F': 2, 'C': 2, 'A': 3},
        'pruned': ['G'],
        'desc': 'A = MAX(3, 2) = 3\nPruned 1 node (G)!\nSame result, less work!',
        'alpha': '3', 'beta': '+∞'
    },
]

def draw_game_tree(ax, step_data, with_pruning=False):
    """Draw game tree with current state"""
    ax.clear()
    ax.set_facecolor('#f8fafc')

    ax.set_title(step_data['title'], fontsize=18, fontweight='bold',
                color='#1e3a5f' if not with_pruning else '#7c3aed', pad=20)

    # Draw edges first
    for node, data in game_tree.items():
        x1, y1 = data['pos']
        for child in data['children']:
            x2, y2 = game_tree[child]['pos']

            is_pruned = child in step_data.get('pruned', [])

            if is_pruned:
                ax.plot([x1, x2], [y1, y2], color='#ef4444', linewidth=3, linestyle='--', zorder=1)
                # Draw X on pruned edge
                mid_x, mid_y = (x1 + x2) / 2, (y1 + y2) / 2
                ax.scatter(mid_x, mid_y, s=200, c='#ef4444', marker='x', zorder=5, linewidths=3)
            else:
                ax.plot([x1, x2], [y1, y2], color='#94a3b8', linewidth=2, zorder=1)

    # Draw nodes
    for node, data in game_tree.items():
        x, y = data['pos']
        values = step_data.get('values', {})

        is_pruned = node in step_data.get('pruned', [])
        is_current = node == step_data.get('current')
        is_evaluated = node in step_data.get('evaluated', [])

        # Determine color and shape
        if is_pruned:
            color = '#fecaca'
            edgecolor = '#ef4444'
        elif is_current:
            color = '#3b82f6'
            edgecolor = '#1e40af'
        elif is_evaluated:
            color = '#86efac' if data['type'] == 'TERM' else '#c4b5fd'
            edgecolor = '#16a34a' if data['type'] == 'TERM' else '#7c3aed'
        else:
            color = '#e2e8f0'
            edgecolor = '#94a3b8'

        # Draw shape based on type
        if data['type'] == 'MAX':
            # Triangle pointing up
            triangle = plt.Polygon([(x, y+25), (x-25, y-15), (x+25, y-15)],
                                  facecolor=color, edgecolor=edgecolor, linewidth=2, zorder=10)
            ax.add_patch(triangle)
            ax.text(x, y-30, 'MAX', fontsize=8, ha='center', color='#1e3a5f', fontweight='bold')
        elif data['type'] == 'MIN':
            # Triangle pointing down
            triangle = plt.Polygon([(x, y-25), (x-25, y+15), (x+25, y+15)],
                                  facecolor=color, edgecolor=edgecolor, linewidth=2, zorder=10)
            ax.add_patch(triangle)
            ax.text(x, y+30, 'MIN', fontsize=8, ha='center', color='#1e3a5f', fontweight='bold')
        else:
            # Circle for terminal
            circle = plt.Circle((x, y), 22, facecolor=color, edgecolor=edgecolor, linewidth=2, zorder=10)
            ax.add_patch(circle)

        # Node label
        ax.text(x, y, node, fontsize=12, ha='center', va='center', fontweight='bold',
               color='white' if is_current else '#1e3a5f', zorder=11)

        # Value label
        if node in values:
            val = values[node]
            ax.text(x + 30, y, f'={val}', fontsize=11, ha='left', va='center',
                   color='#22c55e', fontweight='bold', zorder=11)
        elif data['value'] is not None:
            ax.text(x + 30, y, f'[{data["value"]}]', fontsize=10, ha='left', va='center',
                   color='#64748b', zorder=11)

    # Description box
    props = dict(boxstyle='round,pad=0.5', facecolor='#fef3c7', edgecolor='#f59e0b', alpha=0.95)
    ax.text(0.02, 0.98, step_data['desc'], transform=ax.transAxes, fontsize=11,
            verticalalignment='top', bbox=props)

    # Alpha-Beta values
    if with_pruning and step_data['alpha'] is not None:
        ab_text = f"α = {step_data['alpha']}\nβ = {step_data['beta']}"
        props2 = dict(boxstyle='round,pad=0.5', facecolor='#dbeafe', edgecolor='#3b82f6', alpha=0.95)
        ax.text(0.98, 0.98, ab_text, transform=ax.transAxes, fontsize=12,
                verticalalignment='top', horizontalalignment='right', fontweight='bold', bbox=props2)

    # Legend
    legend_y = 0.15
    ax.text(0.02, legend_y, '△ MAX (maximize)', transform=ax.transAxes, fontsize=9, color='#1e3a5f')
    ax.text(0.02, legend_y - 0.05, '▽ MIN (minimize)', transform=ax.transAxes, fontsize=9, color='#1e3a5f')
    ax.text(0.02, legend_y - 0.10, '○ Terminal (leaf value)', transform=ax.transAxes, fontsize=9, color='#1e3a5f')

    ax.set_xlim(0, 800)
    ax.set_ylim(50, 480)
    ax.axis('off')

def save_visualizations():
    """Save Mini-Max and Alpha-Beta animations"""
    output_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(output_dir)

    for algo, steps, with_pruning in [('minimax', minimax_steps, False), ('alphabeta', alphabeta_steps, True)]:
        print(f"\nCreating {algo} animation...")

        fig, ax = plt.subplots(figsize=(12, 8))
        fig.patch.set_facecolor('#1e3a5f')

        def make_animate(steps_list, pruning):
            def animate(frame):
                step_idx = min(frame // 2, len(steps_list) - 1)
                draw_game_tree(ax, steps_list[step_idx], pruning)
                return []
            return animate

        total_frames = len(steps) * 2 + 4
        anim = FuncAnimation(fig, make_animate(steps, with_pruning), frames=total_frames, interval=1500, blit=True)

        # Save video
        try:
            mp4_path = os.path.join(parent_dir, 'assets', 'videos', f'{algo}.mp4')
            writer = FFMpegWriter(fps=1, bitrate=1800)
            anim.save(mp4_path, writer=writer)
            print(f"  Saved: {mp4_path}")
        except Exception as e:
            print(f"  MP4 error: {e}")

        # Save GIF
        try:
            gif_path = os.path.join(parent_dir, 'assets', 'videos', f'{algo}.gif')
            writer = PillowWriter(fps=1)
            anim.save(gif_path, writer=writer)
            print(f"  Saved: {gif_path}")
        except Exception as e:
            print(f"  GIF error: {e}")

        plt.close(fig)

        # Save frames
        print(f"  Saving {algo} frames...")
        for i, step in enumerate(steps):
            fig_frame, ax = plt.subplots(figsize=(12, 8))
            fig_frame.patch.set_facecolor('#f8fafc')
            draw_game_tree(ax, step, with_pruning)

            frame_path = os.path.join(parent_dir, 'assets', 'images', f'{algo}_step_{i}.png')
            fig_frame.savefig(frame_path, dpi=150, bbox_inches='tight', facecolor='#f8fafc')
            plt.close(fig_frame)
        print(f"  Saved {len(steps)} frames")

    print("\nMini-Max and Alpha-Beta visualizations complete!")

if __name__ == '__main__':
    save_visualizations()
