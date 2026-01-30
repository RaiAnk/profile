# Route Planning Problem - GPS Navigation
class RoutePlanningProblem:
    """
    Real-world route planning problem formulation
    Used by: Google Maps, Uber, Logistics companies
    """

    def __init__(self, start_city, goal_city):
        self.initial_state = start_city
        self.goal = goal_city

        # Romania map - classic AI textbook example
        # Format: city -> [(neighbor, distance), ...]
        self.graph = {
            'Arad': [('Sibiu', 140), ('Timisoara', 118), ('Zerind', 75)],
            'Sibiu': [('Arad', 140), ('Fagaras', 99), ('Oradea', 151), ('Rimnicu', 80)],
            'Timisoara': [('Arad', 118), ('Lugoj', 111)],
            'Zerind': [('Arad', 75), ('Oradea', 71)],
            'Fagaras': [('Sibiu', 99), ('Bucharest', 211)],
            'Oradea': [('Zerind', 71), ('Sibiu', 151)],
            'Rimnicu': [('Sibiu', 80), ('Pitesti', 97), ('Craiova', 146)],
            'Lugoj': [('Timisoara', 111), ('Mehadia', 70)],
            'Mehadia': [('Lugoj', 70), ('Drobeta', 75)],
            'Drobeta': [('Mehadia', 75), ('Craiova', 120)],
            'Craiova': [('Drobeta', 120), ('Rimnicu', 146), ('Pitesti', 138)],
            'Pitesti': [('Rimnicu', 97), ('Craiova', 138), ('Bucharest', 101)],
            'Bucharest': [('Fagaras', 211), ('Pitesti', 101), ('Giurgiu', 90)],
            'Giurgiu': [('Bucharest', 90)]
        }

        # Straight-line distances to Bucharest (for heuristic)
        self.heuristic = {
            'Arad': 366, 'Bucharest': 0, 'Craiova': 160,
            'Drobeta': 242, 'Fagaras': 176, 'Giurgiu': 77,
            'Lugoj': 244, 'Mehadia': 241, 'Oradea': 380,
            'Pitesti': 100, 'Rimnicu': 193, 'Sibiu': 253,
            'Timisoara': 329, 'Zerind': 374
        }

    def actions(self, state):
        """Return cities reachable from current city"""
        return [neighbor for neighbor, _ in self.graph.get(state, [])]

    def result(self, state, action):
        """Moving to neighbor city"""
        return action  # Action is the destination city

    def goal_test(self, state):
        """Are we at the destination?"""
        return state == self.goal

    def step_cost(self, state, action):
        """Distance between cities"""
        for neighbor, cost in self.graph.get(state, []):
            if neighbor == action:
                return cost
        return float('inf')

    def h(self, state):
        """Heuristic: straight-line distance to goal"""
        return self.heuristic.get(state, 0)

# Demo
problem = RoutePlanningProblem('Arad', 'Bucharest')
print("Start:", problem.initial_state)
print("Goal:", problem.goal)
print("From Arad can go to:", problem.actions('Arad'))
print("Heuristic h(Arad):", problem.h('Arad'), "km")