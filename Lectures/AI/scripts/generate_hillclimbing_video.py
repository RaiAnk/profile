"""
Hill Climbing Visualization
Shows local search optimization with local maxima problem

Requirements:
    pip install matplotlib numpy
"""

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.animation import FuncAnimation, FFMpegWriter, PillowWriter
import os

# Define a function with multiple peaks (local maxima)
def f(x):
    """Function with multiple local maxima"""
    return np.sin(x) * np.exp(-0.1 * (x - 5)**2) + 0.5 * np.sin(3*x) + 2

# Hill climbing steps
hill_steps = [
    {'x': 1.0, 'title': 'Step 0: Start Position', 'desc': 'Starting at x = 1.0\nf(x) = {:.2f}\nLooking for higher points...'},
    {'x': 1.5, 'title': 'Step 1: Move Right', 'desc': 'Move to x = 1.5\nf(x) = {:.2f}\nBetter! Continue...'},
    {'x': 2.0, 'title': 'Step 2: Continue Climbing', 'desc': 'Move to x = 2.0\nf(x) = {:.2f}\nStill improving...'},
    {'x': 2.5, 'title': 'Step 3: Approaching Peak', 'desc': 'Move to x = 2.5\nf(x) = {:.2f}\nGetting close to a peak...'},
    {'x': 2.8, 'title': 'Step 4: LOCAL MAXIMUM!', 'desc': 'At x = 2.8\nf(x) = {:.2f}\nLOCAL MAXIMUM REACHED!\nNo neighbor is better.'},
    {'x': 2.8, 'title': 'Step 5: Stuck!', 'desc': 'STUCK at local maximum!\nx = 2.8, f(x) = {:.2f}\nGlobal max is at x ≈ 5\nBut we can\'t reach it!'},
]

# Update descriptions with actual values
for step in hill_steps:
    step['y'] = f(step['x'])
    step['desc'] = step['desc'].format(step['y'])

def create_animation():
    """Create hill climbing animation"""
    fig, ax = plt.subplots(figsize=(14, 8))
    fig.patch.set_facecolor('#1e3a5f')

    x = np.linspace(0, 10, 500)
    y = f(x)

    def animate(frame):
        ax.clear()
        ax.set_facecolor('#f8fafc')

        step_idx = min(frame // 2, len(hill_steps) - 1)
        step = hill_steps[step_idx]

        # Title
        ax.set_title(step['title'], fontsize=20, fontweight='bold', color='#1e3a5f', pad=20)

        # Plot function
        ax.plot(x, y, color='#3b82f6', linewidth=3, label='f(x) = objective function')
        ax.fill_between(x, y, alpha=0.1, color='#3b82f6')

        # Mark global maximum
        global_max_x = x[np.argmax(y)]
        global_max_y = np.max(y)
        ax.scatter(global_max_x, global_max_y, s=200, c='#22c55e', marker='*', zorder=15,
                  label=f'Global Maximum (x≈{global_max_x:.1f})')
        ax.annotate('Global Max', (global_max_x, global_max_y), xytext=(global_max_x + 0.5, global_max_y + 0.3),
                   fontsize=10, color='#22c55e', fontweight='bold')

        # Mark local maximum (where we get stuck)
        ax.scatter(2.8, f(2.8), s=150, c='#f59e0b', marker='^', zorder=14,
                  label='Local Maximum (stuck here!)')

        # Current position
        current_x = step['x']
        current_y = step['y']

        # Trail of previous positions
        for i in range(step_idx):
            prev_x = hill_steps[i]['x']
            prev_y = hill_steps[i]['y']
            ax.scatter(prev_x, prev_y, s=80, c='#94a3b8', zorder=12)

        # Current position (big)
        ax.scatter(current_x, current_y, s=300, c='#ef4444', edgecolors='white',
                  linewidths=2, zorder=20, label='Current Position')

        # Neighbors
        if step_idx < len(hill_steps) - 2:
            left_x = current_x - 0.5
            right_x = current_x + 0.5
            if left_x >= 0:
                ax.scatter(left_x, f(left_x), s=100, c='#c4b5fd', marker='s', zorder=11)
                ax.annotate(f'←f={f(left_x):.2f}', (left_x, f(left_x)), xytext=(left_x - 0.3, f(left_x) + 0.2),
                           fontsize=9, color='#7c3aed')
            if right_x <= 10:
                ax.scatter(right_x, f(right_x), s=100, c='#86efac', marker='s', zorder=11)
                ax.annotate(f'f={f(right_x):.2f}→', (right_x, f(right_x)), xytext=(right_x + 0.1, f(right_x) + 0.2),
                           fontsize=9, color='#16a34a')

        # Description box
        props = dict(boxstyle='round,pad=0.5', facecolor='#fef3c7', edgecolor='#f59e0b', alpha=0.95)
        ax.text(0.02, 0.98, step['desc'], transform=ax.transAxes, fontsize=12,
                verticalalignment='top', bbox=props)

        # Algorithm explanation
        if step_idx >= len(hill_steps) - 2:
            warning = "PROBLEM: Hill Climbing gets\nstuck at local maxima!\n\nSolutions:\n• Random Restart\n• Simulated Annealing\n• Genetic Algorithms"
            props2 = dict(boxstyle='round,pad=0.5', facecolor='#fef2f2', edgecolor='#ef4444', alpha=0.95)
            ax.text(0.98, 0.02, warning, transform=ax.transAxes, fontsize=11,
                    verticalalignment='bottom', horizontalalignment='right', bbox=props2)

        ax.set_xlabel('x', fontsize=12)
        ax.set_ylabel('f(x)', fontsize=12)
        ax.legend(loc='upper right', fontsize=9)
        ax.grid(True, alpha=0.3)
        ax.set_xlim(0, 10)
        ax.set_ylim(0, 4)

        return []

    total_frames = len(hill_steps) * 2 + 4
    anim = FuncAnimation(fig, animate, frames=total_frames, interval=1500, blit=True)
    return fig, anim

def save_visualization():
    """Save hill climbing animation"""
    print("Creating Hill Climbing animation...")

    output_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(output_dir)

    fig, anim = create_animation()

    # Save MP4
    try:
        mp4_path = os.path.join(parent_dir, 'assets', 'videos', 'hillclimbing.mp4')
        writer = FFMpegWriter(fps=1, bitrate=1800)
        anim.save(mp4_path, writer=writer)
        print(f"  Saved: {mp4_path}")
    except Exception as e:
        print(f"  MP4 error: {e}")

    # Save GIF
    try:
        gif_path = os.path.join(parent_dir, 'assets', 'videos', 'hillclimbing.gif')
        writer = PillowWriter(fps=1)
        anim.save(gif_path, writer=writer)
        print(f"  Saved: {gif_path}")
    except Exception as e:
        print(f"  GIF error: {e}")

    plt.close(fig)

    # Save individual frames
    print("  Saving frames...")
    x = np.linspace(0, 10, 500)
    y = f(x)

    for i, step in enumerate(hill_steps):
        fig_frame, ax = plt.subplots(figsize=(14, 8))
        fig_frame.patch.set_facecolor('#f8fafc')
        ax.set_facecolor('#f8fafc')

        ax.set_title(step['title'], fontsize=20, fontweight='bold', color='#1e3a5f', pad=20)
        ax.plot(x, y, color='#3b82f6', linewidth=3)
        ax.fill_between(x, y, alpha=0.1, color='#3b82f6')

        global_max_x = x[np.argmax(y)]
        global_max_y = np.max(y)
        ax.scatter(global_max_x, global_max_y, s=200, c='#22c55e', marker='*', zorder=15)
        ax.scatter(2.8, f(2.8), s=150, c='#f59e0b', marker='^', zorder=14)

        for j in range(i):
            prev_x = hill_steps[j]['x']
            prev_y = hill_steps[j]['y']
            ax.scatter(prev_x, prev_y, s=80, c='#94a3b8', zorder=12)

        ax.scatter(step['x'], step['y'], s=300, c='#ef4444', edgecolors='white', linewidths=2, zorder=20)

        props = dict(boxstyle='round,pad=0.5', facecolor='#fef3c7', edgecolor='#f59e0b', alpha=0.95)
        ax.text(0.02, 0.98, step['desc'], transform=ax.transAxes, fontsize=12,
                verticalalignment='top', bbox=props)

        ax.set_xlabel('x', fontsize=12)
        ax.set_ylabel('f(x)', fontsize=12)
        ax.grid(True, alpha=0.3)
        ax.set_xlim(0, 10)
        ax.set_ylim(0, 4)

        frame_path = os.path.join(parent_dir, 'assets', 'images', f'hillclimb_step_{i}.png')
        fig_frame.savefig(frame_path, dpi=150, bbox_inches='tight', facecolor='#f8fafc')
        plt.close(fig_frame)

    print(f"  Saved {len(hill_steps)} frames")
    print("Hill Climbing visualization complete!")

if __name__ == '__main__':
    save_visualization()
