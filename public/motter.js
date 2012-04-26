// Variables used by more than one function
var container, stats;
var camera, scene, renderer, controls;
var projector;
var ambientLight, directionalLight, directionalLight2; 
var buildings, roads, enemies;
var map_tree = {}; // Road graph
var monsters = {};
var buses = [];
var player_position;
var player_animation = new TWEEN.Tween();
var clock = new THREE.Clock();
var offset_zoom = 0;

function init() 
{
	// Create the main HTML div
	container = document.createElement( 'div' );
	container.id = "content";
	document.body.appendChild( container );

	// Add the stats div
	stats = new Stats();
	stats.domElement.style.position = 'absolute';
	stats.domElement.style.top = '0px';
	container.appendChild( stats.domElement );

	// Add the zoom elements
	zoom_plus = document.createElement('div');
	zoom_plus.id = "zoom_plus";
	container.appendChild(zoom_plus);

	zoom_minus = document.createElement('div');
	zoom_minus.id = "zoom_minus";
	container.appendChild(zoom_minus);

	// Initialise all objects which will be used
	// They are declared globally to be used by all functions
	projector = new THREE.Projector();
	scene = new THREE.Scene();
	buildings = new THREE.Object3D();
	enemies = new THREE.Object3D();
	roads = new THREE.Object3D();
	scene.add(buildings);
	scene.add(enemies);
	scene.add(roads);

	// Initialise the limits to the first object on the map
	var limits = {minX: map_objects[Object.keys(map_objects)[0]].minX, minY: map_objects[Object.keys(map_objects)[0]].minY,
	 maxX: map_objects[Object.keys(map_objects)[0]].maxX, maxY: map_objects[Object.keys(map_objects)[0]].maxY};

	$.each(map_objects, function(index, value)
	{	
		// Fine tune the limits
		limits.minX = Math.min(limits.minX, value.minX);
		limits.minY = Math.min(limits.minY, value.minY);
		limits.maxX = Math.max(limits.maxX, value.maxX);
		limits.maxY = Math.max(limits.maxY, value.maxY);

		if (value.key_type != "highway" && value.key_type != "bus_route")
		{
			// Creates a shape in case of a building
			var newBuildingShape = new THREE.Shape();
			
			$.each(value.shape, function(index, node)
			{
				if (index == 0)
				{
					newBuildingShape.moveTo(node.x, node.y);
				}
				else
				{
					newBuildingShape.lineTo(node.x, node.y);
				}
			});
			
			// Extrude the shape
			var newBuilding3D = newBuildingShape.extrude({amount: value.height, bevelEnabled: false});
			var mesh = new THREE.Mesh(newBuilding3D, new THREE.MeshLambertMaterial( { color: Math.random() * 0xffffff } ));
			mesh.rotation.x = 90 * (Math.PI / 180); // Rotate to have it flat
			// Y = height to be above the ground because of rotation
			mesh.position.set(value.x, value.height, value.y);
			buildings.add(mesh); // Add it to the scene
		}
		else if (value.key_type == "bus_route")
		{
			// If it's a bus, we keep it for later
			buses.push(value);
		}
		else
		{
			var road = new THREE.Geometry();
			
			$.each(value.shape, function(index, node)
			{
				// Add a new vertex to the list of the road
				road.vertices.push(new THREE.Vertex(new THREE.Vector3(node.x, 0, node.y)));
				
				// Structure of the graph for a reminder
				//{a: {point: new Vector2(), links: {b, c}}}
				// Build the graph !
				// All the values are added to the X and Y
				// because they were initially given as relative
				// ad they need to be given as absolute

				if (!(node.id in map_tree)) // Doesn't exist
				{
					// If the node is not yet in the map, add it with its coordinates
					map_tree[node.id] = {point: new THREE.Vector2(node.x + value.x, node.y + value.y), links: {}};
				}

				// Depending on position, add with 1 or two links
				if (index == 0)
				{
					map_tree[node.id]['links'][value.shape[1].id] = 
					map_tree[node.id].point.distanceToSquared(
						new THREE.Vector2(value.shape[1].x + value.x, 
										  value.shape[1].y + value.y));
				}
				else if (value.shape.length == index+1)
				{
					map_tree[node.id]['links'][value.shape[index-1].id] = 
					map_tree[node.id].point.distanceToSquared(
						new THREE.Vector2(value.shape[index-1].x + value.x, 
										  value.shape[index-1].y + value.y));
				}
				else
				{
					map_tree[node.id]['links'][value.shape[index+1].id] = 
					map_tree[node.id].point.distanceToSquared(
						new THREE.Vector2(value.shape[index+1].x + value.x, 
										  value.shape[index+1].y + value.y));
					map_tree[node.id]['links'][value.shape[index-1].id] = 
					map_tree[node.id].point.distanceToSquared(
						new THREE.Vector2(value.shape[index-1].x + value.x, 
										  value.shape[index-1].y + value.y));
				}
			});
			
			// Create a line and add it
			var line = new THREE.Line(road, new THREE.LineBasicMaterial( { color: 0xffffff, opacity: 1.0, linewidth: 150.0 } ) );
			line.position.set(value.x, 0, value.y);
			roads.add(line);
		}
	});

	// Add all the enemies
	for (var k = 0; k < 200; k++)
	{
		// Take a random node on the map
		var key = Object.keys(map_tree)[Math.floor(Math.random() * Object.keys(map_tree).length)]
		var geometry = new THREE.CubeGeometry( 4, 4, 4 );
		var material = new THREE.MeshLambertMaterial( { color: 0x66CD00, shading: THREE.FlatShading, overdraw: true } );
		var cube = new THREE.Mesh( geometry, material );
		// Set the position of the cube the random node
		cube.position.set(map_tree[key].point.x, 4, map_tree[key].point.y);
		monsters[cube.id] = key
		enemies.add(cube);
		// Animate the zombie!
		animateRandom(cube, 200.0);
	}

	// Create the ground
	// TODO: Change size on the fly
	var geometry = new THREE.PlaneGeometry(10000, 10000);
	var planeMaterial = new THREE.MeshPhongMaterial( { color: 0xffffff } );
	THREE.ColorUtils.adjustHSV( planeMaterial.color, 0, 0, 0.9 );
	planeMaterial.ambient = planeMaterial.color;
	var ground = new THREE.Mesh( geometry, planeMaterial );
	ground.rotation.x = -90 * (Math.PI / 180);
	ground.position.set(limits.minX, -5, limits.minY);
	ground.castShadow = false;
	ground.receiveShadow = true;
	ground.name = "ground";
	scene.add(ground);

	// Create the player
	var geometry = new THREE.CubeGeometry( 5, 5, 5 );
	var material = new THREE.MeshLambertMaterial( { color: 0x00ffee, shading: THREE.FlatShading, overdraw: true } );
	var cube = new THREE.Mesh( geometry, material );

	if (buses.length > 0)
	{
		// If there's buses on this part of the map
		// Put him at the starting point of a bus
		cube.position.set(map_tree[buses[0].shape[0].id].point.x, 5, map_tree[buses[0].shape[0].id].point.y);
		player_position = buses[0].shape[0].id;
	}
	else
	{
		// Otherwise at first object
		cube.position.set(map_tree[Object.keys(map_tree)[0]].point.x, 5, map_tree[Object.keys(map_tree)[0]].point.y);
		player_position = Object.keys(map_tree)[0];
	}

	cube.name = "player";
	scene.add(cube);

	// Create the camera
	camera = new THREE.PerspectiveCamera( 35, window.innerWidth / window.innerHeight, 1, 1000 );
	camera.position.x = map_tree[Object.keys(map_tree)[0]].point.x;
	camera.position.y = 200;
	camera.position.z = map_tree[Object.keys(map_tree)[0]].point.y + 60.0;
	camera.rotation.x = -70 * (Math.PI / 180);
	scene.add(camera);

	// Lights
	ambientLight = new THREE.AmbientLight( Math.random() * 0x10 );
	scene.add( ambientLight );

	directionalLight = new THREE.DirectionalLight(0xffffff);
	directionalLight.position.x = map_objects[0].minX;
	directionalLight.position.y = 200;
	directionalLight.position.z = map_objects[0].minY;
	directionalLight.position.normalize();
	scene.add( directionalLight );

	directionalLight2 = new THREE.DirectionalLight(0xffffff);
	directionalLight2.position.x = 0.9 - 0.5;
	directionalLight2.position.y = 0.9 - 0.5;
	directionalLight2.position.z = 0.9 - 0.5;
	directionalLight2.position.normalize();
	scene.add( directionalLight2 );

	// Finally create the renderer
	renderer = new THREE.WebGLRenderer();
	renderer.setSize( window.innerWidth, window.innerHeight );
	container.appendChild(renderer.domElement);

	// Adding the buses now because of the label
	// Label is HTML, so the renderer has to be initialised
	buses_object = new THREE.Object3D();
	scene.add(buses_object)

	for (var k = 0; k < buses.length; k++)
	{
		var geometry = new THREE.CubeGeometry( 10, 10, 10 );
		var material = new THREE.MeshLambertMaterial( { color: 0xff0000, shading: THREE.FlatShading, overdraw: true } );
		var cube = new THREE.Mesh( geometry, material );
		cube.rotation.y = -30 * (Math.PI / 180);
		cube.position.y = 4;

		buses_object.add(cube);
		$("#content").append('<div id="bus-'+cube.id+'" class="label">'+buses[k].type+'</div>');
		animateBus(cube, buses[k].shape, 75.0);
	}

	// Bind the events to the zoom and click function
	$("canvas").on('click', onDocumentMouseDown);
	$("#zoom_plus").on( 'click', click_zoom_plus );
	$("#zoom_minus").on( 'click', click_zoom_minus );
}

// Will be called every frame
function animate() 
{
	requestAnimationFrame( animate );
	render();
	stats.update();
}

// Will be called every frame
// Make sure the camera follows the player
function render() 
{
	TWEEN.update();
	camera.position.x = scene.children[4].position.x;
	camera.position.z = scene.children[4].position.z + 60.0 + offset_zoom;

	renderer.render( scene, camera );
}

// Converts World Coordinates to Screen
function toScreenXY(position) 
{
  var pos = position.clone();
  var projScreenMat = new THREE.Matrix4();
  projScreenMat.multiply(camera.projectionMatrix, camera.matrixWorldInverse);
  projScreenMat.multiplyVector3( pos );

  return { x: ( pos.x + 1 ) * ($("canvas").width()/2),
      y: ( - pos.y + 1) * ($("canvas").height()/2) };
}

// Finds the closest node to the point clicked
function findClosest(point_clicked)
{
	var close_point = Object.keys(map_tree)[0];

	for (key in map_tree)
	{
		if (point_clicked.distanceToSquared(map_tree[key].point) < point_clicked.distanceToSquared(map_tree[close_point].point))
		{
			close_point = key;
		}
	}

	return close_point;
}

// Animates the player
function animateObject(object, path, speed)
{
	// Will update the player position at every call
	var update = function(){ object.position.x = current.x; object.position.z = current.z; }
	var current = object.position.clone();
	// Player is already at 0 so start at 1
	var i = 1;

	var nextPoint = function(){
		i++;

		// If there's still a node to got to
		if (i < path.length)
		{
			// Do the same thing as below
			// Will call this function until 
			// there's no more nodes to go to
			player_position = path[i];
			player_animation = new TWEEN.Tween(current).to(
				{x: map_tree[path[i]].point.x, z: map_tree[path[i]].point.y }, 
				Math.sqrt(map_tree[path[i-1]].links[path[i]]) * speed).onUpdate(update).onComplete(nextPoint).start();
		}
	}

	// Store node ID of the player for calculations
	player_position = path[i];
	// Animate to next node, will call nextPoint
	player_animation = new TWEEN.Tween(current).to(
		{x: map_tree[path[i]].point.x, z: map_tree[path[i]].point.y }, 
		Math.sqrt(map_tree[path[i-1]].links[path[i]]) * speed).onUpdate(update).onComplete(nextPoint).start();
}

// Animates the buses
// Uses same concept as player's animation
function animateBus(object, path, speed)
{
	var update = function()
		{ 
			object.position.x = current.x; 
			object.position.z = current.z;
			var screenCoord = toScreenXY(object.position.clone());
			// Move the label to the screen coordinates!
			$("#bus-"+object.id).css("display", "block");
			$("#bus-"+object.id).css("top", screenCoord.y-20+"px");
			$("#bus-"+object.id).css("left", screenCoord.x-15+"px");
		}

	var current = object.position.clone();
	var i = 1;

	var nextPoint = function(){
		i++;
		if (i < path.length)
		{
			animation = new TWEEN.Tween(current).to(
				{x: map_tree[path[i].id].point.x, z: map_tree[path[i].id].point.y }, 
				Math.sqrt(map_tree[path[i-1].id].links[path[i].id]) * speed).onUpdate(update).onComplete(nextPoint).start();
		}
		else
		{
			// We want the bus to loop, so we call animateBus
			// when we are done
			object.position.x = map_tree[path[0].id].point.x;
			object.position.z = map_tree[path[0].id].point.y;
			$("#bus-"+object.id).css("display", "none");
			animateBus(object, path, speed);
		}
	}

	// Add a delay to not have all the buses start at the same time
	var animation = new TWEEN.Tween(current).to(
		{x: map_tree[path[i].id].point.x, z: map_tree[path[i].id].point.y }, 
		Math.sqrt(map_tree[path[i-1].id].links[path[i].id]) * speed).onUpdate(update).onComplete(nextPoint).delay((Math.random() * 5000) + (Math.random() * 8000)).start();
}

// Uses same concepts but instead of following
// a path, it choses at random amongts
// its accessible nodes
function animateRandom(object, speed)
{
	var update = function(){ object.position.x = current.x; object.position.z = current.z; }
	var current = object.position.clone();

	var nextPoint = function()
	{
		var next = Object.keys(map_tree[monsters[object.id]].links)[Math.floor(Object.keys(map_tree[monsters[object.id]].links).length * Math.random())];
		var current_node = monsters[object.id];
		monsters[object.id] = next;

		new TWEEN.Tween(current).to(
			{x: map_tree[next].point.x, z: map_tree[next].point.y }, 
			Math.sqrt(map_tree[current_node].links[next]) * speed).onUpdate(update).onComplete(nextPoint).start();
	}

	var next = Object.keys(map_tree[monsters[object.id]].links)[Math.floor(Object.keys(map_tree[monsters[object.id]].links).length * Math.random())];
	var current_node = monsters[object.id];
	monsters[object.id] = next;

	new TWEEN.Tween(current).to(
		{x: map_tree[next].point.x, z: map_tree[next].point.y }, 
		Math.sqrt(map_tree[current_node].links[next]) * speed).onUpdate(update).onComplete(nextPoint).start();
}

// Move the camera up
// Adds an offset to make sure the players stays in the middle
function click_zoom_minus(event)
{
	event.preventDefault();
	if (offset_zoom < 100)
	{
		camera.position.y += 10;
		offset_zoom += 2.5;
	}
}

// Reverse of the zoom minus
function click_zoom_plus(event)
{
	event.preventDefault();
	if (offset_zoom > 0)
	{
		camera.position.y -= 10;
		offset_zoom -= 2.5;
	}
}

// Called when user clicks
function onDocumentMouseDown( event ) 
{
	// Prevent the default JS event stuff
	event.preventDefault();

	// Create a ray for the vector
	var vector = new THREE.Vector3( ( event.clientX / window.innerWidth ) * 2 - 1, - ( event.clientY / window.innerHeight ) * 2 + 1, 0.5 );
	// Un project the screen coordinates to world coordinates
	projector.unprojectVector( vector, camera );
	var ray = new THREE.Ray( camera.position, vector.subSelf( camera.position ).normalize() );

	// Two rays, one for the general scene and one specific for monsters
	var intersects = ray.intersectObjects( scene.children );
	var intersectsMonsters = ray.intersectObjects( scene.children[1].children );

	// If a monster is hit from from screen coordinates
	if (intersectsMonsters.length > 0)
	{
		// Shoot a ray from player's cube to check visibility
		var rayMonster = new THREE.Ray(scene.children[4].position, 
			intersectsMonsters[0].object.position.clone().subSelf( scene.children[4].position ).normalize());
		var intersectsBuilding = rayMonster.intersectObjects(scene.children[0].children);

		// If no building is hit
		if (intersectsBuilding.length == 0)
		{
			// Kill it!
			scene.__removeObject(intersectsMonsters[0].object);
		}
		else 
		{
			// If a building is hit, check who's hit first, monster or building
			var realIntersectsMonsters = rayMonster.intersectObjects(scene.children[1].children);

			if (intersectsBuilding[0].distance > realIntersectsMonsters[0].distance)
			{
				// If it's the monster, kill it!
				scene.__removeObject(intersectsMonsters[0].object);
			}
		}
	}
	else if (intersects.length > 0 && intersects[0].object.name == "ground") 
	{
		// If it hits the ground then it means the player wants to move
		// Stop current animation and find a new path
		player_animation.stop();
		var closest = findClosest(new THREE.Vector2(intersects[0].point.x, intersects[0].point.z));
		var path = findPath(map_tree, player_position, closest);
		path.push(closest);													

		// Animate the player
		animateObject(scene.children[4], path, 25.0);
	}
}