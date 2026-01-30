"""
DFS vs BFS Visualization
Generates animations showing both search algorithms on a tree

Requirements:
    pip install matplotlib numpy
"""

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.animation import FuncAnimation, FFMpegWriter, PillowWriter
import numpy as np
import os

# Tree structure for visualization
# Format: node -> {'pos': (x, y), 'children': [child_nodes]}
tree = {
    'A': {'pos': (400, 450), 'children': ['B', 'C']},
    'B': {'pos': (200, 350), 'children': ['D', 'E']},
    'C': {'pos': (600, 350), 'children': ['F', 'G']},
    'D': {'pos': (100, 250), 'children': []},
    'E': {'pos': (300, 250), 'children': ['H']},
    'F': {'pos': (500, 250), 'children': []},
    'G': {'pos': (700, 250), 'children': ['I']},
    'H': {'pos': (300, 150), 'children': []},
    'I': {'pos': (700, 150), 'children': []}  # Goal node
}

# DFS steps
dfs_steps = [
    {'title': 'DFS Step 0: Initialize', 'current': None, 'visited': [], 'stack': ['A'], 'path': [],
     'desc': 'Start with root A in stack\nStack: [A]\nDFS uses LIFO (Last-In-First-Out)'},
    {'title': 'DFS Step 1: Visit A', 'current': 'A', 'visited': ['A'], 'stack': ['B', 'C'], 'path': ['A'],
     'desc': 'Pop A, push children B, C\nStack: [B, C]\nGo DEEP first'},
    {'title': 'DFS Step 2: Visit C', 'current': 'C', 'visited': ['A', 'C'], 'stack': ['B', 'F', 'G'], 'path': ['A', 'C'],
     'desc': 'Pop C (last in), push F, G\nStack: [B, F, G]\nExploring right subtree'},
    {'title': 'DFS Step 3: Visit G', 'current': 'G', 'visited': ['A', 'C', 'G'], 'stack': ['B', 'F', 'I'], 'path': ['A', 'C', 'G'],
     'desc': 'Pop G, push I\nStack: [B, F, I]\nGoing deeper...'},
    {'title': 'DFS Step 4: GOAL I Found!', 'current': 'I', 'visited': ['A', 'C', 'G', 'I'], 'stack': ['B', 'F'], 'path': ['A', 'C', 'G', 'I'],
     'desc': 'Pop I - GOAL FOUND!\nPath: A → C → G → I\nNodes explored: 4'},
]

# BFS steps
bfs_steps = [
    {'title': 'BFS Step 0: Initialize', 'current': None, 'visited': [], 'queue': ['A'], 'path': [],
     'desc': 'Start with root A in queue\nQueue: [A]\nBFS uses FIFO (First-In-First-Out)'},
    {'title': 'BFS Step 1: Visit A', 'current': 'A', 'visited': ['A'], 'queue': ['B', 'C'], 'path': ['A'],
     'desc': 'Dequeue A, enqueue B, C\nQueue: [B, C]\nLevel 0 complete'},
    {'title': 'BFS Step 2: Visit B', 'current': 'B', 'visited': ['A', 'B'], 'queue': ['C', 'D', 'E'], 'path': ['A', 'B'],
     'desc': 'Dequeue B (first in), enqueue D, E\nQueue: [C, D, E]\nLevel 1...'},
    {'title': 'BFS Step 3: Visit C', 'current': 'C', 'visited': ['A', 'B', 'C'], 'queue': ['D', 'E', 'F', 'G'], 'path': ['A', 'C'],
     'desc': 'Dequeue C, enqueue F, G\nQueue: [D, E, F, G]\nLevel 1 complete'},
    {'title': 'BFS Step 4: Visit D', 'current': 'D', 'visited': ['A', 'B', 'C', 'D'], 'queue': ['E', 'F', 'G'], 'path': ['A', 'B', 'D'],
     'desc': 'Dequeue D (leaf node)\nQueue: [E, F, G]\nLevel 2...'},
    {'title': 'BFS Step 5: Visit E', 'current': 'E', 'visited': ['A', 'B', 'C', 'D', 'E'], 'queue': ['F', 'G', 'H'], 'path': ['A', 'B', 'E'],
     'desc': 'Dequeue E, enqueue H\nQueue: [F, G, H]\nLevel 2...'},
    {'title': 'BFS Step 6: Visit F', 'current': 'F', 'visited': ['A', 'B', 'C', 'D', 'E', 'F'], 'queue': ['G', 'H'], 'path': ['A', 'C', 'F'],
     'desc': 'Dequeue F (leaf node)\nQueue: [G, H]\nLevel 2...'},
    {'title': 'BFS Step 7: Visit G', 'current': 'G', 'visited': ['A', 'B', 'C', 'D', 'E', 'F', 'G'], 'queue': ['H', 'I'], 'path': ['A', 'C', 'G'],
     'desc': 'Dequeue G, enqueue I\nQueue: [H, I]\nLevel 2 complete'},
    {'title': 'BFS Step 8: Visit H', 'current': 'H', 'visited': ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], 'queue': ['I'], 'path': ['A', 'B', 'E', 'H'],
     'desc': 'Dequeue H (leaf node)\nQueue: [I]\nLevel 3...'},
    {'title': 'BFS Step 9: GOAL I Found!', 'current': 'I', 'visited': ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'], 'queue': [], 'path': ['A', 'C', 'G', 'I'],
     'desc': 'Dequeue I - GOAL FOUND!\nPath: A → C → G → I (Shortest!)\nNodes explored: 9'},
]

def draw_tree(ax, step, algorithm='DFS'):
    """Draw the tree with current state"""
    ax.clear()
    ax.set_facecolor('#f8fafc')

    steps = dfs_steps if algorithm == 'DFS' else bfs_steps
    step_data = steps[step]

    # Title
    ax.set_title(step_data['title'], fontsize=20, fontweight='bold',
                color='#1e3a5f' if algorithm == 'DFS' else '#0369a1', pad=20)

    # Draw edges first
    for node, data in tree.items():
        x1, y1 = data['pos']
        for child in data['children']:
            x2, y2 = tree[child]['pos']

            # Check if edge is in path
            path = step_data.get('path', [])
            in_path = False
            for i in range(len(path) - 1):
                if (path[i] == node and path[i+1] == child) or \
                   (path[i] == child and path[i+1] == node):
                    in_path = True
                    break

            if in_path:
                ax.plot([x1, x2], [y1, y2], color='#22c55e', linewidth=4, zorder=1)
            else:
                ax.plot([x1, x2], [y1, y2], color='#cbd5e1', linewidth=2, zorder=1)

    # Draw nodes
    for node, data in tree.items():
        x, y = data['pos']

        # Determine node color
        if node == 'I':  # Goal
            if node in step_data.get('visited', []):
                color = '#22c55e'  # Found!
            else:
                color = '#f59e0b'  # Goal - yellow
            size = 900
        elif node == step_data.get('current'):
            color = '#3b82f6' if algorithm == 'DFS' else '#0ea5e9'  # Current - blue
            size = 1000
        elif node in step_data.get('visited', []):
            color = '#6b7280'  # Visited - gray
            size = 700
        elif node in step_data.get('stack', []) or node in step_data.get('queue', []):
            color = '#c4b5fd' if algorithm == 'DFS' else '#bae6fd'  # In frontier
            size = 700
        else:
            color = '#e2e8f0'  # Unvisited
            size = 600

        ax.scatter(x, y, s=size, c=color, edgecolors='#1e3a5f', linewidths=2, zorder=10)
        ax.text(x, y, node, fontsize=14, ha='center', va='center', fontweight='bold',
               color='white' if color not in ['#e2e8f0', '#c4b5fd', '#bae6fd'] else '#1e3a5f', zorder=11)

    # Info box
    data_struct = 'Stack' if algorithm == 'DFS' else 'Queue'
    frontier = step_data.get('stack', step_data.get('queue', []))

    info_text = f"{data_struct}: {frontier}\nVisited: {step_data.get('visited', [])}"
    props = dict(boxstyle='round,pad=0.5', facecolor='#e0f2fe' if algorithm == 'BFS' else '#ede9fe',
                edgecolor='#0284c7' if algorithm == 'BFS' else '#7c3aed', alpha=0.95)
    ax.text(0.02, 0.98, info_text, transform=ax.transAxes, fontsize=10,
            verticalalignment='top', fontfamily='monospace', bbox=props)

    # Description
    props2 = dict(boxstyle='round,pad=0.5', facecolor='#fef3c7', edgecolor='#f59e0b', alpha=0.95)
    ax.text(0.98, 0.98, step_data['desc'], transform=ax.transAxes, fontsize=11,
            verticalalignment='top', horizontalalignment='right', bbox=props2)

    # Algorithm label
    algo_color = '#7c3aed' if algorithm == 'DFS' else '#0284c7'
    ax.text(0.5, 0.02, f'{algorithm} - {"Stack (LIFO)" if algorithm == "DFS" else "Queue (FIFO)"}',
           transform=ax.transAxes, fontsize=14, ha='center', fontweight='bold',
           color='white', bbox=dict(boxstyle='round,pad=0.5', facecolor=algo_color))

    ax.set_xlim(0, 800)
    ax.set_ylim(50, 520)
    ax.axis('off')

def save_visualizations():
    """Save DFS and BFS animations"""
    output_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(output_dir)

    for algorithm in ['DFS', 'BFS']:
        print(f"\nCreating {algorithm} animation...")
        steps = dfs_steps if algorithm == 'DFS' else bfs_steps

        # Create animation
        fig, ax = plt.subplots(figsize=(12, 8))
        fig.patch.set_facecolor('#1e3a5f')

        def animate(frame):
            step_idx = min(frame // 2, len(steps) - 1)
            draw_tree(ax, step_idx, algorithm)
            return []

        total_frames = len(steps) * 2 + 2
        anim = FuncAnimation(fig, animate, frames=total_frames, interval=1000, blit=True)

        # Save video
        try:
            mp4_path = os.path.join(parent_dir, 'assets', 'videos', f'{algorithm.lower()}_search.mp4')
            writer = FFMpegWriter(fps=1, bitrate=1800)
            anim.save(mp4_path, writer=writer)
            print(f"  Saved: {mp4_path}")
        except Exception as e:
            print(f"  MP4 error: {e}")

        # Save GIF
        try:
            gif_path = os.path.join(parent_dir, 'assets', 'videos', f'{algorithm.lower()}_search.gif')
            writer = PillowWriter(fps=1)
            anim.save(gif_path, writer=writer)
            print(f"  Saved: {gif_path}")
        except Exception as e:
            print(f"  GIF error: {e}")

        plt.close(fig)

        # Save individual frames
        print(f"  Saving {algorithm} frames...")
        for i, step in enumerate(steps):
            fig_frame, ax = plt.subplots(figsize=(12, 8))
            fig_frame.patch.set_facecolor('#f8fafc')
            draw_tree(ax, i, algorithm)

            frame_path = os.path.join(parent_dir, 'assets', 'images', f'{algorithm.lower()}_step_{i}.png')
            fig_frame.savefig(frame_path, dpi=150, bbox_inches='tight', facecolor='#f8fafc')
            plt.close(fig_frame)
        print(f"  Saved {len(steps)} frames")

    print("\nDFS and BFS visualizations complete!")

if __name__ == '__main__':
    save_visualizations()
