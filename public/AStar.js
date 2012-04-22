function findPath(map_tree, start_node, end_node)
{
	var closed_set = {};
	var open_set = {};
	var came_from = {};
	var path = [];

	open_set[start_node] = {g: null, h: null, f: null};
	open_set[start_node].g = 0;
	open_set[start_node].h = heuristic_cost(map_tree[start_node].point, map_tree[end_node].point);
	open_set[start_node].f = open_set[start_node].g + open_set[start_node].h;

	while (Object.keys(open_set).length != 0)
	{
		var current = findLowestF(open_set);

		if (current == end_node)
		{
			reconstructPath(path, came_from, came_from[end_node]);
			return path;
		}

		closed_set[current] = open_set[current];
		delete open_set[current];

		for (neighbour in map_tree[current].links)
		{
			if (!(neighbour in closed_set))
			{
				var tentative_g = closed_set[current].g + map_tree[current].links[neighbour];
				var better_tentative = false;

				if (!(neighbour in open_set))
				{
					open_set[neighbour] = {h: heuristic_cost(map_tree[neighbour].point, map_tree[end_node].point), g: null, f: null};
					better_tentative = true;
				}
				else if (tentative_g < open_set[neighbour].g)
				{
					better_tentative = true;
				}

				if (better_tentative)
				{
					came_from[neighbour] = current;
					open_set[neighbour].g = tentative_g;
					open_set[neighbour].f = open_set[neighbour].g + open_set[neighbour].h;
				}
			}
		}
	}

	return path;
}

function heuristic_cost(start_point, end_point)
{
	return start_point.distanceToSquared(end_point);
}

function reconstructPath(path, came_from, current_node)
{
	if (current_node in came_from)
	{
		reconstructPath(path, came_from, came_from[current_node]);
		path.push(current_node);
	}
	else
	{
		path.push(current_node);
	}
}

function findLowestF(open_set)
{
	var lowest = Object.keys(open_set)[0];

	for (key in open_set)
	{
		if (open_set[key].f < open_set[lowest].f)
		{
			lowest = key;
		}
	}

	return lowest;
}