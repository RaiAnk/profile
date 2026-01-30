"""
A* Pathfinding Animation Video Generator
Generates an MP4 video showing step-by-step A* search on Romania map

Requirements:
    pip install matplotlib numpy

To generate video:
    python generate_astar_video.py
"""

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.animation import FuncAnimation, FFMpegWriter, PillowWriter
import numpy as np
import os

# Romania map data
cities = {
    'Arad': (91, 492),
    'Zerind': (75, 540),
    'Oradea': (131, 571),
    'Sibiu': (207, 457),
    'Timisoara': (94, 410),
    'Lugoj': (165, 379),
    'Mehadia': (168, 339),
    'Drobeta': (143, 306),
    'Craiova': (265, 299),
    'Rimnicu': (293, 406),
    'Fagaras': (305, 449),
    'Pitesti': (320, 368),
    'Bucharest': (400, 340),
    'Giurgiu': (375, 290)
}

# Road connections with distances
roads = [
    ('Arad', 'Zerind', 75),
    ('Arad', 'Sibiu', 140),
    ('Arad', 'Timisoara', 118),
    ('Zerind', 'Oradea', 71),
    ('Oradea', 'Sibiu', 151),
    ('Sibiu', 'Fagaras', 99),
    ('Sibiu', 'Rimnicu', 80),
    ('Timisoara', 'Lugoj', 111),
    ('Lugoj', 'Mehadia', 70),
    ('Mehadia', 'Drobeta', 75),
    ('Drobeta', 'Craiova', 120),
    ('Craiova', 'Rimnicu', 146),
    ('Craiova', 'Pitesti', 138),
    ('Rimnicu', 'Pitesti', 97),
    ('Fagaras', 'Bucharest', 211),
    ('Pitesti', 'Bucharest', 101),
    ('Bucharest', 'Giurgiu', 90)
]

# Heuristic values (straight-line distance to Bucharest)
heuristics = {
    'Arad': 366, 'Bucharest': 0, 'Craiova': 160, 'Drobeta': 242,
    'Fagaras': 176, 'Giurgiu': 77, 'Lugoj': 244, 'Mehadia': 241,
    'Oradea': 380, 'Pitesti': 100, 'Rimnicu': 193, 'Sibiu': 253,
    'Timisoara': 329, 'Zerind': 374
}

# A* search steps
astar_steps = [
    {
        'step': 0,
        'title': 'Step 0: Initialize',
        'current': 'Arad',
        'path': ['Arad'],
        'visited': [],
        'frontier': ['Arad'],
        'g': 0, 'h': 366, 'f': 366,
        'desc': 'Start at Arad\ng(n)=0, h(n)=366, f(n)=366'
    },
    {
        'step': 1,
        'title': 'Step 1: Expand Arad',
        'current': 'Arad',
        'path': ['Arad'],
        'visited': ['Arad'],
        'frontier': ['Sibiu', 'Timisoara', 'Zerind'],
        'g': 0, 'h': 366, 'f': 366,
        'desc': 'Expand Arad\nFrontier: Sibiu(393), Timisoara(447), Zerind(449)'
    },
    {
        'step': 2,
        'title': 'Step 2: Select Sibiu (f=393)',
        'current': 'Sibiu',
        'path': ['Arad', 'Sibiu'],
        'visited': ['Arad', 'Sibiu'],
        'frontier': ['Rimnicu', 'Fagaras', 'Timisoara', 'Zerind', 'Oradea'],
        'g': 140, 'h': 253, 'f': 393,
        'desc': 'Expand Sibiu (lowest f=393)\ng(n)=140, h(n)=253, f(n)=393'
    },
    {
        'step': 3,
        'title': 'Step 3: Select Rimnicu (f=413)',
        'current': 'Rimnicu',
        'path': ['Arad', 'Sibiu', 'Rimnicu'],
        'visited': ['Arad', 'Sibiu', 'Rimnicu'],
        'frontier': ['Fagaras', 'Pitesti', 'Craiova', 'Timisoara'],
        'g': 220, 'h': 193, 'f': 413,
        'desc': 'Expand Rimnicu (f=413)\ng(n)=220, h(n)=193, f(n)=413'
    },
    {
        'step': 4,
        'title': 'Step 4: Select Fagaras (f=415)',
        'current': 'Fagaras',
        'path': ['Arad', 'Sibiu', 'Fagaras'],
        'visited': ['Arad', 'Sibiu', 'Rimnicu', 'Fagaras'],
        'frontier': ['Pitesti', 'Bucharest', 'Craiova'],
        'g': 239, 'h': 176, 'f': 415,
        'desc': 'Expand Fagaras (f=415)\nBucharest found! But f=450'
    },
    {
        'step': 5,
        'title': 'Step 5: Select Pitesti (f=417)',
        'current': 'Pitesti',
        'path': ['Arad', 'Sibiu', 'Rimnicu', 'Pitesti'],
        'visited': ['Arad', 'Sibiu', 'Rimnicu', 'Fagaras', 'Pitesti'],
        'frontier': ['Bucharest', 'Craiova'],
        'g': 317, 'h': 100, 'f': 417,
        'desc': 'Expand Pitesti (f=417)\nBetter path to Bucharest! f=418'
    },
    {
        'step': 6,
        'title': 'Step 6: GOAL REACHED!',
        'current': 'Bucharest',
        'path': ['Arad', 'Sibiu', 'Rimnicu', 'Pitesti', 'Bucharest'],
        'visited': ['Arad', 'Sibiu', 'Rimnicu', 'Fagaras', 'Pitesti', 'Bucharest'],
        'frontier': [],
        'g': 418, 'h': 0, 'f': 418,
        'desc': 'GOAL REACHED!\nOptimal Path: 418 km'
    }
]

def create_animation():
    """Create the A* pathfinding animation"""

    fig, ax = plt.subplots(1, 1, figsize=(14, 10))
    fig.patch.set_facecolor('#1e3a5f')

    def draw_frame(frame_idx):
        ax.clear()
        ax.set_facecolor('#f8fafc')

        step_idx = min(frame_idx // 2, len(astar_steps) - 1)  # Each step shows for 2 frames
        step = astar_steps[step_idx]

        # Title
        ax.set_title(step['title'], fontsize=20, fontweight='bold', color='#1e3a5f', pad=20)

        # Draw roads first (background)
        for city1, city2, dist in roads:
            x1, y1 = cities[city1]
            x2, y2 = cities[city2]

            # Check if road is in current path
            in_path = False
            path = step['path']
            for i in range(len(path) - 1):
                if (path[i] == city1 and path[i+1] == city2) or \
                   (path[i] == city2 and path[i+1] == city1):
                    in_path = True
                    break

            if step_idx == len(astar_steps) - 1 and in_path:
                # Final path - thick green
                ax.plot([x1, x2], [y1, y2], color='#22c55e', linewidth=8, zorder=1, alpha=0.8)
                ax.plot([x1, x2], [y1, y2], color='#16a34a', linewidth=4, zorder=2)
            elif in_path:
                # Current path - blue
                ax.plot([x1, x2], [y1, y2], color='#3b82f6', linewidth=5, zorder=2)
            else:
                # Normal road - gray
                ax.plot([x1, x2], [y1, y2], color='#cbd5e1', linewidth=2, zorder=1)

            # Distance label
            mid_x, mid_y = (x1 + x2) / 2, (y1 + y2) / 2
            ax.text(mid_x, mid_y + 8, f'{dist}', fontsize=8, ha='center', color='#64748b')

        # Draw cities
        for city, (x, y) in cities.items():
            # Determine node color
            if city == 'Arad':
                color = '#10b981'  # Green - start
                size = 800
            elif city == 'Bucharest':
                if step_idx == len(astar_steps) - 1:
                    color = '#22c55e'  # Goal reached
                else:
                    color = '#f59e0b'  # Yellow - goal
                size = 800
            elif city == step['current']:
                color = '#3b82f6'  # Blue - current
                size = 1000
            elif city in step['visited']:
                color = '#6b7280'  # Gray - visited
                size = 600
            elif city in step['frontier']:
                color = '#93c5fd'  # Light blue - frontier
                size = 600
            else:
                color = '#e2e8f0'  # Light gray - unvisited
                size = 500

            # Final path nodes
            if step_idx == len(astar_steps) - 1 and city in step['path']:
                color = '#22c55e'
                size = 900

            ax.scatter(x, y, s=size, c=color, edgecolors='#1e3a5f', linewidths=2, zorder=10)

            # City name
            ax.text(x, y - 25, city, fontsize=9, ha='center', fontweight='bold', color='#1e3a5f', zorder=11)

            # h(n) value
            ax.text(x, y + 22, f'h={heuristics[city]}', fontsize=7, ha='center', color='#64748b', zorder=11)

        # Info box
        info_text = f"Current: {step['current']}\n"
        info_text += f"g(n) = {step['g']} km\n"
        info_text += f"h(n) = {step['h']} km\n"
        info_text += f"f(n) = {step['f']} km\n\n"
        info_text += f"Path: {' → '.join(step['path'])}"

        props = dict(boxstyle='round,pad=0.5', facecolor='#e0f2fe', edgecolor='#0284c7', alpha=0.95)
        ax.text(0.02, 0.98, info_text, transform=ax.transAxes, fontsize=11,
                verticalalignment='top', fontfamily='monospace', bbox=props)

        # Description box
        props2 = dict(boxstyle='round,pad=0.5', facecolor='#fef3c7', edgecolor='#f59e0b', alpha=0.95)
        ax.text(0.98, 0.98, step['desc'], transform=ax.transAxes, fontsize=11,
                verticalalignment='top', horizontalalignment='right', bbox=props2)

        # Legend
        legend_elements = [
            mpatches.Patch(color='#10b981', label='Start (Arad)'),
            mpatches.Patch(color='#f59e0b', label='Goal (Bucharest)'),
            mpatches.Patch(color='#3b82f6', label='Current Node'),
            mpatches.Patch(color='#6b7280', label='Visited'),
            mpatches.Patch(color='#93c5fd', label='Frontier'),
            mpatches.Patch(color='#22c55e', label='Optimal Path')
        ]
        ax.legend(handles=legend_elements, loc='lower right', fontsize=9, framealpha=0.95)

        # Path cost for final step
        if step_idx == len(astar_steps) - 1:
            ax.text(0.5, 0.05, 'OPTIMAL PATH FOUND: Arad → Sibiu → Rimnicu → Pitesti → Bucharest = 418 km',
                   transform=ax.transAxes, fontsize=14, ha='center', fontweight='bold',
                   color='white', bbox=dict(boxstyle='round,pad=0.5', facecolor='#22c55e', edgecolor='#16a34a'))

        ax.set_xlim(40, 450)
        ax.set_ylim(250, 600)
        ax.set_aspect('equal')
        ax.axis('off')

        return []

    # Create animation (each step shows for 2 frames = 2 seconds at 1 fps)
    total_frames = len(astar_steps) * 2 + 4  # Extra frames at end
    anim = FuncAnimation(fig, draw_frame, frames=total_frames, interval=1000, blit=True)

    return fig, anim

def save_animation():
    """Save the animation as MP4 and GIF"""

    print("Creating A* pathfinding animation...")
    fig, anim = create_animation()

    output_dir = os.path.dirname(os.path.abspath(__file__))

    # Try to save as MP4 first
    mp4_path = os.path.join(output_dir, 'astar_pathfinding.mp4')
    gif_path = os.path.join(output_dir, 'astar_pathfinding.gif')

    try:
        print("Saving as MP4...")
        writer = FFMpegWriter(fps=1, metadata=dict(artist='AI Course'), bitrate=1800)
        anim.save(mp4_path, writer=writer)
        print(f"MP4 saved: {mp4_path}")
    except Exception as e:
        print(f"Could not save MP4 (ffmpeg may not be installed): {e}")
        print("Trying GIF instead...")

    try:
        print("Saving as GIF...")
        writer = PillowWriter(fps=1)
        anim.save(gif_path, writer=writer)
        print(f"GIF saved: {gif_path}")
    except Exception as e:
        print(f"Could not save GIF: {e}")

    # Also save individual frames as images
    print("Saving individual frames...")
    for i, step in enumerate(astar_steps):
        fig_frame, ax = plt.subplots(1, 1, figsize=(14, 10))
        fig_frame.patch.set_facecolor('#f8fafc')
        ax.set_facecolor('#f8fafc')

        # Draw the frame (similar to animation)
        ax.set_title(step['title'], fontsize=20, fontweight='bold', color='#1e3a5f', pad=20)

        # Draw roads
        for city1, city2, dist in roads:
            x1, y1 = cities[city1]
            x2, y2 = cities[city2]

            in_path = False
            path = step['path']
            for j in range(len(path) - 1):
                if (path[j] == city1 and path[j+1] == city2) or \
                   (path[j] == city2 and path[j+1] == city1):
                    in_path = True
                    break

            if i == len(astar_steps) - 1 and in_path:
                ax.plot([x1, x2], [y1, y2], color='#22c55e', linewidth=8, zorder=1, alpha=0.8)
                ax.plot([x1, x2], [y1, y2], color='#16a34a', linewidth=4, zorder=2)
            elif in_path:
                ax.plot([x1, x2], [y1, y2], color='#3b82f6', linewidth=5, zorder=2)
            else:
                ax.plot([x1, x2], [y1, y2], color='#cbd5e1', linewidth=2, zorder=1)

            mid_x, mid_y = (x1 + x2) / 2, (y1 + y2) / 2
            ax.text(mid_x, mid_y + 8, f'{dist}', fontsize=8, ha='center', color='#64748b')

        # Draw cities
        for city, (x, y) in cities.items():
            if city == 'Arad':
                color = '#10b981'
                size = 800
            elif city == 'Bucharest':
                color = '#22c55e' if i == len(astar_steps) - 1 else '#f59e0b'
                size = 800
            elif city == step['current']:
                color = '#3b82f6'
                size = 1000
            elif city in step['visited']:
                color = '#6b7280'
                size = 600
            elif city in step['frontier']:
                color = '#93c5fd'
                size = 600
            else:
                color = '#e2e8f0'
                size = 500

            if i == len(astar_steps) - 1 and city in step['path']:
                color = '#22c55e'
                size = 900

            ax.scatter(x, y, s=size, c=color, edgecolors='#1e3a5f', linewidths=2, zorder=10)
            ax.text(x, y - 25, city, fontsize=9, ha='center', fontweight='bold', color='#1e3a5f', zorder=11)
            ax.text(x, y + 22, f'h={heuristics[city]}', fontsize=7, ha='center', color='#64748b', zorder=11)

        # Info boxes
        info_text = f"Current: {step['current']}\ng(n) = {step['g']} km\nh(n) = {step['h']} km\nf(n) = {step['f']} km\n\nPath: {' → '.join(step['path'])}"
        props = dict(boxstyle='round,pad=0.5', facecolor='#e0f2fe', edgecolor='#0284c7', alpha=0.95)
        ax.text(0.02, 0.98, info_text, transform=ax.transAxes, fontsize=11,
                verticalalignment='top', fontfamily='monospace', bbox=props)

        props2 = dict(boxstyle='round,pad=0.5', facecolor='#fef3c7', edgecolor='#f59e0b', alpha=0.95)
        ax.text(0.98, 0.98, step['desc'], transform=ax.transAxes, fontsize=11,
                verticalalignment='top', horizontalalignment='right', bbox=props2)

        if i == len(astar_steps) - 1:
            ax.text(0.5, 0.05, 'OPTIMAL PATH FOUND: Arad → Sibiu → Rimnicu → Pitesti → Bucharest = 418 km',
                   transform=ax.transAxes, fontsize=14, ha='center', fontweight='bold',
                   color='white', bbox=dict(boxstyle='round,pad=0.5', facecolor='#22c55e'))

        ax.set_xlim(40, 450)
        ax.set_ylim(250, 600)
        ax.set_aspect('equal')
        ax.axis('off')

        frame_path = os.path.join(output_dir, f'astar_step_{i}.png')
        fig_frame.savefig(frame_path, dpi=150, bbox_inches='tight', facecolor='#f8fafc')
        plt.close(fig_frame)
        print(f"  Saved: astar_step_{i}.png")

    plt.close(fig)
    print("\nDone! Files created in:", output_dir)
    print("\nTo use in HTML, add:")
    print('  <video controls><source src="astar_pathfinding.mp4" type="video/mp4"></video>')
    print('  OR')
    print('  <img src="astar_pathfinding.gif" alt="A* Animation">')

if __name__ == '__main__':
    save_animation()
