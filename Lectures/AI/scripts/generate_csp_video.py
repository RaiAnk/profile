"""
CSP (Constraint Satisfaction Problem) - Class Scheduling Visualization
Generates an MP4/GIF video showing backtracking search for class scheduling

Requirements:
    pip install matplotlib numpy

To generate video:
    python generate_csp_video.py
"""

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.animation import FuncAnimation, FFMpegWriter, PillowWriter
import numpy as np
import os

# Problem Setup
classes = ['AI', 'Database', 'Networks', 'OS']
time_slots = ['Mon 9AM', 'Mon 11AM', 'Tue 9AM', 'Tue 11AM']
rooms = ['Room 101', 'Room 102']
professors = {
    'AI': 'Prof. Smith',
    'Database': 'Prof. Smith',  # Same professor!
    'Networks': 'Prof. Jones',
    'OS': 'Prof. Jones'
}

# Colors for classes
class_colors = {
    'AI': '#3b82f6',      # Blue
    'Database': '#10b981', # Green
    'Networks': '#f59e0b', # Orange
    'OS': '#8b5cf6'        # Purple
}

# Backtracking steps
csp_steps = [
    {
        'step': 0,
        'title': 'Step 0: Problem Setup',
        'assignment': {},
        'current_class': None,
        'trying': None,
        'status': 'Starting CSP Backtracking Search',
        'desc': 'Classes: AI, Database, Networks, OS\nConstraint 1: No room conflicts\nConstraint 2: Same professor can\'t teach at same time'
    },
    {
        'step': 1,
        'title': 'Step 1: Assign AI',
        'assignment': {'AI': ('Mon 9AM', 'Room 101')},
        'current_class': 'AI',
        'trying': ('Mon 9AM', 'Room 101'),
        'status': 'Assigned AI to Mon 9AM, Room 101',
        'desc': 'Try first available slot\nAI → Mon 9AM, Room 101\nNo conflicts - SUCCESS!'
    },
    {
        'step': 2,
        'title': 'Step 2: Assign Database',
        'assignment': {'AI': ('Mon 9AM', 'Room 101')},
        'current_class': 'Database',
        'trying': ('Mon 9AM', 'Room 101'),
        'conflict': True,
        'status': 'CONFLICT! Mon 9AM, Room 101 already taken',
        'desc': 'Try Mon 9AM, Room 101\n❌ CONFLICT: Room already used by AI'
    },
    {
        'step': 3,
        'title': 'Step 2: Try Database Again',
        'assignment': {'AI': ('Mon 9AM', 'Room 101')},
        'current_class': 'Database',
        'trying': ('Mon 9AM', 'Room 102'),
        'conflict': True,
        'status': 'CONFLICT! Prof. Smith teaches AI at Mon 9AM',
        'desc': 'Try Mon 9AM, Room 102\n❌ CONFLICT: Prof. Smith already\nteaching AI at this time!'
    },
    {
        'step': 4,
        'title': 'Step 2: Database Assigned',
        'assignment': {'AI': ('Mon 9AM', 'Room 101'), 'Database': ('Mon 11AM', 'Room 101')},
        'current_class': 'Database',
        'trying': ('Mon 11AM', 'Room 101'),
        'status': 'Assigned Database to Mon 11AM, Room 101',
        'desc': 'Try Mon 11AM, Room 101\n✓ No room conflict\n✓ Prof. Smith is free\nSUCCESS!'
    },
    {
        'step': 5,
        'title': 'Step 3: Assign Networks',
        'assignment': {
            'AI': ('Mon 9AM', 'Room 101'),
            'Database': ('Mon 11AM', 'Room 101'),
            'Networks': ('Mon 9AM', 'Room 102')
        },
        'current_class': 'Networks',
        'trying': ('Mon 9AM', 'Room 102'),
        'status': 'Assigned Networks to Mon 9AM, Room 102',
        'desc': 'Try Mon 9AM, Room 102\n✓ Room 102 is free at Mon 9AM\n✓ Prof. Jones is free\nSUCCESS!'
    },
    {
        'step': 6,
        'title': 'Step 4: Assign OS',
        'assignment': {
            'AI': ('Mon 9AM', 'Room 101'),
            'Database': ('Mon 11AM', 'Room 101'),
            'Networks': ('Mon 9AM', 'Room 102')
        },
        'current_class': 'OS',
        'trying': ('Mon 9AM', 'Room 101'),
        'conflict': True,
        'status': 'CONFLICT! Room 101 used by AI',
        'desc': 'Try Mon 9AM, Room 101\n❌ CONFLICT: Room occupied'
    },
    {
        'step': 7,
        'title': 'Step 4: Try OS Again',
        'assignment': {
            'AI': ('Mon 9AM', 'Room 101'),
            'Database': ('Mon 11AM', 'Room 101'),
            'Networks': ('Mon 9AM', 'Room 102')
        },
        'current_class': 'OS',
        'trying': ('Mon 9AM', 'Room 102'),
        'conflict': True,
        'status': 'CONFLICT! Prof. Jones teaches Networks',
        'desc': 'Try Mon 9AM, Room 102\n❌ CONFLICT: Prof. Jones already\nteaching Networks at Mon 9AM!'
    },
    {
        'step': 8,
        'title': 'Step 4: OS Assigned',
        'assignment': {
            'AI': ('Mon 9AM', 'Room 101'),
            'Database': ('Mon 11AM', 'Room 101'),
            'Networks': ('Mon 9AM', 'Room 102'),
            'OS': ('Mon 11AM', 'Room 102')
        },
        'current_class': 'OS',
        'trying': ('Mon 11AM', 'Room 102'),
        'status': 'Assigned OS to Mon 11AM, Room 102',
        'desc': 'Try Mon 11AM, Room 102\n✓ Room 102 is free at Mon 11AM\n✓ Prof. Jones is free\nSUCCESS!'
    },
    {
        'step': 9,
        'title': 'SOLUTION FOUND!',
        'assignment': {
            'AI': ('Mon 9AM', 'Room 101'),
            'Database': ('Mon 11AM', 'Room 101'),
            'Networks': ('Mon 9AM', 'Room 102'),
            'OS': ('Mon 11AM', 'Room 102')
        },
        'current_class': None,
        'trying': None,
        'status': 'All classes scheduled successfully!',
        'desc': 'Complete valid schedule:\n• AI: Mon 9AM, Room 101 (Smith)\n• Database: Mon 11AM, Room 101 (Smith)\n• Networks: Mon 9AM, Room 102 (Jones)\n• OS: Mon 11AM, Room 102 (Jones)'
    }
]

def create_animation():
    """Create the CSP scheduling animation"""

    fig, ax = plt.subplots(1, 1, figsize=(14, 10))
    fig.patch.set_facecolor('#1e3a5f')

    def draw_frame(frame_idx):
        ax.clear()
        ax.set_facecolor('#f8fafc')

        step_idx = min(frame_idx // 2, len(csp_steps) - 1)
        step = csp_steps[step_idx]

        # Title
        ax.set_title(step['title'], fontsize=22, fontweight='bold', color='#1e3a5f', pad=20)

        # Draw the timetable grid
        grid_left = 0.15
        grid_right = 0.85
        grid_top = 0.75
        grid_bottom = 0.25

        n_slots = len(time_slots)
        n_rooms = len(rooms)

        slot_width = (grid_right - grid_left) / n_slots
        room_height = (grid_top - grid_bottom) / n_rooms

        # Draw grid lines and headers
        ax.plot([grid_left, grid_right], [grid_top, grid_top], color='#1e3a5f', linewidth=2, transform=ax.transAxes)
        ax.plot([grid_left, grid_right], [grid_bottom, grid_bottom], color='#1e3a5f', linewidth=2, transform=ax.transAxes)

        # Time slot headers
        for i, slot in enumerate(time_slots):
            x = grid_left + i * slot_width + slot_width / 2
            ax.text(x, grid_top + 0.03, slot, transform=ax.transAxes, ha='center', fontsize=12, fontweight='bold', color='#1e3a5f')
            ax.plot([grid_left + i * slot_width, grid_left + i * slot_width], [grid_bottom, grid_top + 0.02], color='#1e3a5f', linewidth=1, transform=ax.transAxes)
        ax.plot([grid_right, grid_right], [grid_bottom, grid_top + 0.02], color='#1e3a5f', linewidth=1, transform=ax.transAxes)

        # Room headers
        for i, room in enumerate(rooms):
            y = grid_top - i * room_height - room_height / 2
            ax.text(grid_left - 0.02, y, room, transform=ax.transAxes, ha='right', va='center', fontsize=12, fontweight='bold', color='#1e3a5f')
            ax.plot([grid_left - 0.01, grid_right], [grid_top - (i + 1) * room_height, grid_top - (i + 1) * room_height], color='#94a3b8', linewidth=1, linestyle='--', transform=ax.transAxes)

        # Draw assignments
        assignment = step.get('assignment', {})
        for class_name, (slot, room) in assignment.items():
            slot_idx = time_slots.index(slot)
            room_idx = rooms.index(room)

            x = grid_left + slot_idx * slot_width + slot_width / 2
            y = grid_top - room_idx * room_height - room_height / 2

            # Draw class box
            box_width = slot_width * 0.8
            box_height = room_height * 0.7

            color = class_colors[class_name]
            rect = mpatches.FancyBboxPatch(
                (x - box_width/2, y - box_height/2),
                box_width, box_height,
                transform=ax.transAxes,
                boxstyle="round,pad=0.02",
                facecolor=color,
                edgecolor='#1e3a5f',
                linewidth=2
            )
            ax.add_patch(rect)

            # Class name
            ax.text(x, y + 0.02, class_name, transform=ax.transAxes, ha='center', va='center',
                   fontsize=14, fontweight='bold', color='white')
            # Professor name
            ax.text(x, y - 0.03, professors[class_name], transform=ax.transAxes, ha='center', va='center',
                   fontsize=9, color='white', alpha=0.9)

        # Highlight current attempt
        trying = step.get('trying')
        current_class = step.get('current_class')
        if trying and current_class:
            slot, room = trying
            slot_idx = time_slots.index(slot)
            room_idx = rooms.index(room)

            x = grid_left + slot_idx * slot_width + slot_width / 2
            y = grid_top - room_idx * room_height - room_height / 2

            box_width = slot_width * 0.85
            box_height = room_height * 0.75

            is_conflict = step.get('conflict', False)

            if is_conflict:
                # Red dashed box for conflict
                rect = mpatches.FancyBboxPatch(
                    (x - box_width/2, y - box_height/2),
                    box_width, box_height,
                    transform=ax.transAxes,
                    boxstyle="round,pad=0.02",
                    facecolor='#fef2f2',
                    edgecolor='#ef4444',
                    linewidth=3,
                    linestyle='--'
                )
                ax.add_patch(rect)
                ax.text(x, y, f'❌ {current_class}?', transform=ax.transAxes, ha='center', va='center',
                       fontsize=12, fontweight='bold', color='#ef4444')
            else:
                # Green highlight for attempting
                if current_class not in assignment:
                    rect = mpatches.FancyBboxPatch(
                        (x - box_width/2, y - box_height/2),
                        box_width, box_height,
                        transform=ax.transAxes,
                        boxstyle="round,pad=0.02",
                        facecolor='#d1fae5',
                        edgecolor='#22c55e',
                        linewidth=3,
                        linestyle='--'
                    )
                    ax.add_patch(rect)
                    ax.text(x, y, f'✓ {current_class}', transform=ax.transAxes, ha='center', va='center',
                           fontsize=12, fontweight='bold', color='#059669')

        # Status box
        status_color = '#ef4444' if step.get('conflict') else '#22c55e' if 'SUCCESS' in step.get('status', '') or 'SOLUTION' in step['title'] else '#3b82f6'
        props = dict(boxstyle='round,pad=0.5', facecolor=status_color, edgecolor='#1e3a5f', alpha=0.9)
        ax.text(0.5, 0.12, step['status'], transform=ax.transAxes, fontsize=14,
                ha='center', fontweight='bold', color='white', bbox=props)

        # Description box
        props2 = dict(boxstyle='round,pad=0.5', facecolor='#fef3c7', edgecolor='#f59e0b', alpha=0.95)
        ax.text(0.02, 0.98, step['desc'], transform=ax.transAxes, fontsize=11,
                verticalalignment='top', bbox=props2)

        # Legend
        legend_elements = [
            mpatches.Patch(color=class_colors['AI'], label='AI (Prof. Smith)'),
            mpatches.Patch(color=class_colors['Database'], label='Database (Prof. Smith)'),
            mpatches.Patch(color=class_colors['Networks'], label='Networks (Prof. Jones)'),
            mpatches.Patch(color=class_colors['OS'], label='OS (Prof. Jones)')
        ]
        ax.legend(handles=legend_elements, loc='lower left', fontsize=10, framealpha=0.95)

        # Constraints reminder
        constraints = "Constraints:\n1. One class per room per time slot\n2. Professor can't teach two classes simultaneously"
        props3 = dict(boxstyle='round,pad=0.3', facecolor='#e0f2fe', edgecolor='#0284c7', alpha=0.9)
        ax.text(0.98, 0.02, constraints, transform=ax.transAxes, fontsize=9,
                ha='right', va='bottom', bbox=props3)

        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.axis('off')

        return []

    total_frames = len(csp_steps) * 2 + 4
    anim = FuncAnimation(fig, draw_frame, frames=total_frames, interval=1000, blit=True)

    return fig, anim

def save_animation():
    """Save the animation as MP4 and GIF"""

    print("Creating CSP Scheduling animation...")
    fig, anim = create_animation()

    output_dir = os.path.dirname(os.path.abspath(__file__))

    mp4_path = os.path.join(output_dir, 'csp_scheduling.mp4')
    gif_path = os.path.join(output_dir, 'csp_scheduling.gif')

    try:
        print("Saving as MP4...")
        writer = FFMpegWriter(fps=1, metadata=dict(artist='AI Course'), bitrate=1800)
        anim.save(mp4_path, writer=writer)
        print(f"MP4 saved: {mp4_path}")
    except Exception as e:
        print(f"Could not save MP4: {e}")

    try:
        print("Saving as GIF...")
        writer = PillowWriter(fps=1)
        anim.save(gif_path, writer=writer)
        print(f"GIF saved: {gif_path}")
    except Exception as e:
        print(f"Could not save GIF: {e}")

    # Save individual frames
    print("Saving individual frames...")
    for i, step in enumerate(csp_steps):
        fig_frame, ax = plt.subplots(1, 1, figsize=(14, 10))
        fig_frame.patch.set_facecolor('#f8fafc')
        ax.set_facecolor('#f8fafc')

        # Draw the frame
        ax.set_title(step['title'], fontsize=22, fontweight='bold', color='#1e3a5f', pad=20)

        grid_left = 0.15
        grid_right = 0.85
        grid_top = 0.75
        grid_bottom = 0.25

        n_slots = len(time_slots)
        n_rooms = len(rooms)

        slot_width = (grid_right - grid_left) / n_slots
        room_height = (grid_top - grid_bottom) / n_rooms

        ax.plot([grid_left, grid_right], [grid_top, grid_top], color='#1e3a5f', linewidth=2, transform=ax.transAxes)
        ax.plot([grid_left, grid_right], [grid_bottom, grid_bottom], color='#1e3a5f', linewidth=2, transform=ax.transAxes)

        for j, slot in enumerate(time_slots):
            x = grid_left + j * slot_width + slot_width / 2
            ax.text(x, grid_top + 0.03, slot, transform=ax.transAxes, ha='center', fontsize=12, fontweight='bold', color='#1e3a5f')
            ax.plot([grid_left + j * slot_width, grid_left + j * slot_width], [grid_bottom, grid_top + 0.02], color='#1e3a5f', linewidth=1, transform=ax.transAxes)
        ax.plot([grid_right, grid_right], [grid_bottom, grid_top + 0.02], color='#1e3a5f', linewidth=1, transform=ax.transAxes)

        for j, room in enumerate(rooms):
            y = grid_top - j * room_height - room_height / 2
            ax.text(grid_left - 0.02, y, room, transform=ax.transAxes, ha='right', va='center', fontsize=12, fontweight='bold', color='#1e3a5f')
            ax.plot([grid_left - 0.01, grid_right], [grid_top - (j + 1) * room_height, grid_top - (j + 1) * room_height], color='#94a3b8', linewidth=1, linestyle='--', transform=ax.transAxes)

        assignment = step.get('assignment', {})
        for class_name, (slot, room) in assignment.items():
            slot_idx = time_slots.index(slot)
            room_idx = rooms.index(room)

            x = grid_left + slot_idx * slot_width + slot_width / 2
            y = grid_top - room_idx * room_height - room_height / 2

            box_width = slot_width * 0.8
            box_height = room_height * 0.7

            color = class_colors[class_name]
            rect = mpatches.FancyBboxPatch(
                (x - box_width/2, y - box_height/2),
                box_width, box_height,
                transform=ax.transAxes,
                boxstyle="round,pad=0.02",
                facecolor=color,
                edgecolor='#1e3a5f',
                linewidth=2
            )
            ax.add_patch(rect)

            ax.text(x, y + 0.02, class_name, transform=ax.transAxes, ha='center', va='center',
                   fontsize=14, fontweight='bold', color='white')
            ax.text(x, y - 0.03, professors[class_name], transform=ax.transAxes, ha='center', va='center',
                   fontsize=9, color='white', alpha=0.9)

        trying = step.get('trying')
        current_class = step.get('current_class')
        if trying and current_class:
            slot, room = trying
            slot_idx = time_slots.index(slot)
            room_idx = rooms.index(room)

            x = grid_left + slot_idx * slot_width + slot_width / 2
            y = grid_top - room_idx * room_height - room_height / 2

            box_width = slot_width * 0.85
            box_height = room_height * 0.75

            is_conflict = step.get('conflict', False)

            if is_conflict:
                rect = mpatches.FancyBboxPatch(
                    (x - box_width/2, y - box_height/2),
                    box_width, box_height,
                    transform=ax.transAxes,
                    boxstyle="round,pad=0.02",
                    facecolor='#fef2f2',
                    edgecolor='#ef4444',
                    linewidth=3,
                    linestyle='--'
                )
                ax.add_patch(rect)
                ax.text(x, y, f'X {current_class}?', transform=ax.transAxes, ha='center', va='center',
                       fontsize=12, fontweight='bold', color='#ef4444')
            else:
                if current_class not in assignment:
                    rect = mpatches.FancyBboxPatch(
                        (x - box_width/2, y - box_height/2),
                        box_width, box_height,
                        transform=ax.transAxes,
                        boxstyle="round,pad=0.02",
                        facecolor='#d1fae5',
                        edgecolor='#22c55e',
                        linewidth=3,
                        linestyle='--'
                    )
                    ax.add_patch(rect)

        status_color = '#ef4444' if step.get('conflict') else '#22c55e' if 'SUCCESS' in step.get('status', '') or 'SOLUTION' in step['title'] else '#3b82f6'
        props = dict(boxstyle='round,pad=0.5', facecolor=status_color, edgecolor='#1e3a5f', alpha=0.9)
        ax.text(0.5, 0.12, step['status'], transform=ax.transAxes, fontsize=14,
                ha='center', fontweight='bold', color='white', bbox=props)

        props2 = dict(boxstyle='round,pad=0.5', facecolor='#fef3c7', edgecolor='#f59e0b', alpha=0.95)
        ax.text(0.02, 0.98, step['desc'], transform=ax.transAxes, fontsize=11,
                verticalalignment='top', bbox=props2)

        legend_elements = [
            mpatches.Patch(color=class_colors['AI'], label='AI (Prof. Smith)'),
            mpatches.Patch(color=class_colors['Database'], label='Database (Prof. Smith)'),
            mpatches.Patch(color=class_colors['Networks'], label='Networks (Prof. Jones)'),
            mpatches.Patch(color=class_colors['OS'], label='OS (Prof. Jones)')
        ]
        ax.legend(handles=legend_elements, loc='lower left', fontsize=10, framealpha=0.95)

        constraints = "Constraints:\n1. One class per room per time slot\n2. Professor can't teach two classes simultaneously"
        props3 = dict(boxstyle='round,pad=0.3', facecolor='#e0f2fe', edgecolor='#0284c7', alpha=0.9)
        ax.text(0.98, 0.02, constraints, transform=ax.transAxes, fontsize=9,
                ha='right', va='bottom', bbox=props3)

        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.axis('off')

        frame_path = os.path.join(output_dir, f'csp_step_{i}.png')
        fig_frame.savefig(frame_path, dpi=150, bbox_inches='tight', facecolor='#f8fafc')
        plt.close(fig_frame)
        print(f"  Saved: csp_step_{i}.png")

    plt.close(fig)
    print("\nDone! CSP files created.")

if __name__ == '__main__':
    save_animation()
